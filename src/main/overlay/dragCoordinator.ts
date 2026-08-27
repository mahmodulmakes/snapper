import { screen, type BrowserWindow, type IpcMainEvent } from 'electron'
import {
  clampRectToVirtualDesktop,
  globalRectToOverlayLocalPoints,
  originForDisplayId,
  overlayLocalPointToGlobalPoint,
  type DisplayInfo
} from '../capture/displayManager'
import { IPC } from '../ipc/channels'
import { logger } from '../logger'
import { computeDragRect, nudgeRect, rectIntersection, type Point, type Rect } from '../../shared/selectionMath'
import type {
  DragModifiersPayload,
  OverlayDragModifiersPayload,
  OverlayDragStartPayload,
  OverlayResizeStartPayload,
  OverlaySelectionNudgePayload,
  OverlaySelectionStatePayload,
  SelectionHandleId
} from '../../shared/types'

// Cross-display drag coordination (BUILD-SPEC.md §4.2 done-when criterion).
// Each overlay window is its own BrowserWindow tracking only its own local
// mousedown/mousemove/mouseup, so a drag that crosses from one display's
// screen area into another's would otherwise never be tracked by the
// destination window (spikes/FINDINGS.md, gate status section). This module
// makes the main process the single source of truth for the live selection
// rect during a drag: it polls the global cursor position and pushes each
// overlay window its own local slice of the rect every tick.

export interface OverlayEntry {
  displayId: number
  window: BrowserWindow
}

interface DragState {
  anchorInPoints: Point // global
  modifiers: DragModifiersPayload
  lastCursorInPoints: Point // global, updated every tick — drives Space-to-pan
  pollTimer: ReturnType<typeof setInterval>
  // Resize only (handleResizeStart) — a fresh drag-out never sets these.
  axisLock?: { axis: 'x' | 'y'; pinnedValueInPoints: number }
  minSizeInPoints?: number
}

const DRAG_POLL_INTERVAL_MS = 16
// A fresh drag-out can legitimately shrink to nothing (canceling the
// selection, per finalizeSelection's width/height >= 2 check) — but a resize
// handle grabbed on an existing selection shouldn't be able to drag it into
// that same degenerate state; it should just stop shrinking.
const MIN_RESIZE_SIZE_IN_POINTS = 10

let dragState: DragState | null = null
let finalizedRectInPoints: Rect | null = null // global
let finalizedHostDisplayId: number | null = null

function currentDisplayInfos(): DisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    boundsInPoints: display.bounds,
    scaleFactor: display.scaleFactor
  }))
}

function containsPoint(bounds: Rect, point: Point): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
}

/** Which window should host the toolbar for a (possibly cross-display) finalized rect: whichever display contains its bottom-right corner, or failing that, whichever it overlaps most. */
function determineToolbarHostDisplayId(overlays: OverlayEntry[], displays: DisplayInfo[], globalRect: Rect): number | null {
  const bottomRight: Point = { x: globalRect.x + globalRect.width, y: globalRect.y + globalRect.height }
  const displayIdsInPool = new Set(overlays.map((entry) => entry.displayId))
  const containing = displays.find((display) => displayIdsInPool.has(display.id) && containsPoint(display.boundsInPoints, bottomRight))
  if (containing) return containing.id

  let best: { displayId: number; area: number } | null = null
  for (const entry of overlays) {
    const display = displays.find((d) => d.id === entry.displayId)
    if (!display) continue
    const intersection = rectIntersection(globalRect, display.boundsInPoints)
    if (!intersection) continue
    const area = intersection.width * intersection.height
    if (!best || area > best.area) best = { displayId: entry.displayId, area }
  }
  return best?.displayId ?? null
}

/** Sends every overlay window its own local slice of the (possibly cross-display) selection rect. A window untouched by the rect just gets an off-canvas rect, which draws nothing extra — no special-casing needed. */
function broadcastSelectionState(
  overlays: OverlayEntry[],
  displays: DisplayInfo[],
  phase: 'dragging' | 'finalized',
  globalRect: Rect | null,
  hostDisplayId: number | null
): void {
  for (const entry of overlays) {
    const origin = globalRect ? originForDisplayId(entry.displayId, displays) : null
    // No matching display (e.g. disconnected mid-drag) — same as "rect
    // doesn't touch this window": send the off-canvas rect rather than
    // guessing at a position with a stale/unreliable origin.
    const localRect = globalRect && origin ? globalRectToOverlayLocalPoints(origin, globalRect) : { x: 0, y: 0, width: 0, height: 0 }
    const payload: OverlaySelectionStatePayload = {
      phase,
      rectInPoints: localRect,
      isToolbarHost: hostDisplayId !== null && entry.displayId === hostDisplayId
    }
    entry.window.webContents.send(IPC.OVERLAY_SELECTION_STATE, payload)
  }
}

/**
 * A resize handle can only ever shrink the ONE axis it's meant to shrink
 * (see `anchorForHandle` — the other axis's cursor coordinate is already
 * pinned so `computeDragRect` holds it exactly at the original size). Keeps
 * that axis's edge from crossing the anchor into degeneracy by clamping the
 * size and re-deriving position from whichever side is actually anchored —
 * `x === anchor.x` is an exact comparison, not approximate: `computeDragRect`
 * assigns one of those two values verbatim, never a derived one.
 */
function clampResizeMinSize(rect: Rect, anchor: Point, minSize: number): Rect {
  let { x, y, width, height } = rect
  if (width < minSize) {
    x = x === anchor.x ? anchor.x : anchor.x - minSize
    width = minSize
  }
  if (height < minSize) {
    y = y === anchor.y ? anchor.y : anchor.y - minSize
    height = minSize
  }
  return { x, y, width, height }
}

/**
 * Reads the cursor, applies Space-to-pan (shifts the anchor by however far
 * the cursor moved since the last tick, keeping the anchor-to-cursor vector
 * — and thus the rect's size — constant while its position follows the
 * cursor, mirroring what the renderer used to do locally with mousemove
 * deltas), and returns the resulting rect. Only valid while dragState is set
 * (tickDrag/handleDragEnd both guard).
 *
 * Resize (`axisLock` set) reuses this same tick instead of its own: pinning
 * one of the cursor's two axes to a fixed value before handing it to
 * `computeDragRect` makes that axis hold at its original size while the
 * other tracks the real cursor — exactly a corner-drag's math, just with one
 * axis disabled, so no separate resize formula is needed.
 */
function advanceDragTick(displays: DisplayInfo[]): Rect {
  const state = dragState as DragState
  const cursor = screen.getCursorScreenPoint()
  if (state.modifiers.space) {
    state.anchorInPoints = {
      x: state.anchorInPoints.x + (cursor.x - state.lastCursorInPoints.x),
      y: state.anchorInPoints.y + (cursor.y - state.lastCursorInPoints.y)
    }
  }
  state.lastCursorInPoints = cursor
  const effectiveCursor = state.axisLock ? { ...cursor, [state.axisLock.axis]: state.axisLock.pinnedValueInPoints } : cursor
  let rect = computeDragRect(state.anchorInPoints, effectiveCursor, state.modifiers)
  if (state.minSizeInPoints !== undefined) rect = clampResizeMinSize(rect, state.anchorInPoints, state.minSizeInPoints)
  return clampRectToVirtualDesktop(rect, displays)
}

function tickDrag(overlays: OverlayEntry[]): void {
  if (!dragState) return
  const displays = currentDisplayInfos()
  broadcastSelectionState(overlays, displays, 'dragging', advanceDragTick(displays), null)
}

function finalizeSelection(overlays: OverlayEntry[], globalRect: Rect | null): void {
  const displays = currentDisplayInfos()
  if (globalRect && globalRect.width >= 2 && globalRect.height >= 2) {
    finalizedRectInPoints = globalRect
    finalizedHostDisplayId = determineToolbarHostDisplayId(overlays, displays, globalRect)
    broadcastSelectionState(overlays, displays, 'finalized', globalRect, finalizedHostDisplayId)
  } else {
    finalizedRectInPoints = null
    finalizedHostDisplayId = null
    broadcastSelectionState(overlays, displays, 'finalized', null, null)
  }
}

/**
 * The current finalized selection and which display hosts it — e.g. for
 * Universal Text Capture (BUILD-SPEC.md §4.9), which needs the same
 * host-display determination as the region-capture toolbar but reads it
 * AFTER `handleDragEnd`, not via the toolbar's own IPC round-trip.
 */
export function getFinalizedSelection(): { rectInPoints: Rect; hostDisplayId: number | null } | null {
  return finalizedRectInPoints ? { rectInPoints: finalizedRectInPoints, hostDisplayId: finalizedHostDisplayId } : null
}

/** Stops cursor polling and forgets the finalized rect. Safe to call any time, including when no drag is active. */
export function resetDragState(): void {
  if (dragState) clearInterval(dragState.pollTimer)
  dragState = null
  finalizedRectInPoints = null
  finalizedHostDisplayId = null
}

/** Overlay renderer's mousedown (BUILD-SPEC.md §4.2) — starts main-process cursor polling so the live rect can be drawn across every touched display, not just the originating window. */
export function handleDragStart(overlays: OverlayEntry[], event: IpcMainEvent, payload: OverlayDragStartPayload): void {
  const entry = overlays.find((o) => o.window.webContents === event.sender)
  if (!entry) {
    logger.error('Received a drag-start from an overlay window not in the pool.')
    return
  }
  const origin = originForDisplayId(entry.displayId, currentDisplayInfos())
  if (!origin) {
    logger.error(`No display found for overlay window's displayId ${entry.displayId}; cannot start a drag without a known origin.`)
    return
  }
  if (dragState) clearInterval(dragState.pollTimer)
  finalizedRectInPoints = null
  const anchorInPoints = overlayLocalPointToGlobalPoint(origin, payload.anchorInPoints)
  dragState = {
    anchorInPoints,
    modifiers: payload.modifiers,
    lastCursorInPoints: anchorInPoints,
    pollTimer: setInterval(() => tickDrag(overlays), DRAG_POLL_INTERVAL_MS)
  }
  tickDrag(overlays)
}

/** Shift/Option toggled mid-drag (BUILD-SPEC.md §4.2: square / resize-from-center). */
export function handleDragModifiers(overlays: OverlayEntry[], payload: OverlayDragModifiersPayload): void {
  if (!dragState) return
  dragState.modifiers = payload.modifiers
  tickDrag(overlays)
}

/**
 * For each handle: the anchor is the OPPOSITE corner/edge of the current
 * rect (the point that must stay fixed), and `axisLock` — only set for the 4
 * edge-midpoint handles, which may only change one dimension — pins the
 * cursor's other axis to the anchor's own value on that axis, so
 * `computeDragRect`'s width/height on that axis comes out exactly unchanged.
 * Corner handles need no lock: both axes are meant to move together.
 */
function anchorForHandle(handle: SelectionHandleId, rect: Rect): Pick<DragState, 'anchorInPoints' | 'axisLock'> {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  switch (handle) {
    case 'nw':
      return { anchorInPoints: { x: right, y: bottom } }
    case 'ne':
      return { anchorInPoints: { x: left, y: bottom } }
    case 'sw':
      return { anchorInPoints: { x: right, y: top } }
    case 'se':
      return { anchorInPoints: { x: left, y: top } }
    case 'n':
      return { anchorInPoints: { x: left, y: bottom }, axisLock: { axis: 'x', pinnedValueInPoints: right } }
    case 's':
      return { anchorInPoints: { x: left, y: top }, axisLock: { axis: 'x', pinnedValueInPoints: right } }
    case 'e':
      return { anchorInPoints: { x: left, y: top }, axisLock: { axis: 'y', pinnedValueInPoints: bottom } }
    case 'w':
      return { anchorInPoints: { x: right, y: top }, axisLock: { axis: 'y', pinnedValueInPoints: bottom } }
  }
}

/**
 * A resize handle grabbed on the finalized selection (Settings-independent —
 * this is the region-capture toolbar's own selection-adjustment gesture, not
 * anything from BUILD-SPEC.md). Reuses the exact same cross-display
 * cursor-polling machinery as a fresh drag-out (`handleDragStart`/`tickDrag`)
 * so a resize that grows the selection onto another display behaves
 * correctly for free — `handleDragEnd` finalizes it exactly like a normal
 * drag once the mouse comes up, no separate end handler needed.
 */
export function handleResizeStart(overlays: OverlayEntry[], _event: IpcMainEvent, payload: OverlayResizeStartPayload): void {
  if (!finalizedRectInPoints) return
  const { anchorInPoints, axisLock } = anchorForHandle(payload.handle, finalizedRectInPoints)
  if (dragState) clearInterval(dragState.pollTimer)
  finalizedRectInPoints = null
  dragState = {
    anchorInPoints,
    modifiers: { square: false, fromCenter: false, space: false },
    lastCursorInPoints: screen.getCursorScreenPoint(),
    axisLock,
    minSizeInPoints: MIN_RESIZE_SIZE_IN_POINTS,
    pollTimer: setInterval(() => tickDrag(overlays), DRAG_POLL_INTERVAL_MS)
  }
  tickDrag(overlays)
}

/** Overlay renderer's mouseup — stops polling and broadcasts the finalized rect + which window hosts the toolbar. */
export function handleDragEnd(overlays: OverlayEntry[]): void {
  if (!dragState) return
  const rect = advanceDragTick(currentDisplayInfos())
  clearInterval(dragState.pollTimer)
  dragState = null
  finalizeSelection(overlays, rect)
}

/** Arrow-key nudge (BUILD-SPEC.md §4.2), sent by the toolbar-host window only. */
export function handleSelectionNudge(overlays: OverlayEntry[], payload: OverlaySelectionNudgePayload): void {
  if (!finalizedRectInPoints) return
  finalizeSelection(overlays, clampRectToVirtualDesktop(nudgeRect(finalizedRectInPoints, payload.dx, payload.dy), currentDisplayInfos()))
}

/** "Redo Selection" toolbar button — clears the finalized rect on every window, not just the host. */
export function handleSelectionRedo(overlays: OverlayEntry[]): void {
  finalizedRectInPoints = null
  broadcastSelectionState(overlays, currentDisplayInfos(), 'finalized', null, null)
}
