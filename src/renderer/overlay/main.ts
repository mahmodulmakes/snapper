// Window-under-cursor detection is not built yet — everything else from
// BUILD-SPEC.md §4.2/§4.3's region capture flow lives here. Drag-rect
// *computation* lives in the main process (main/overlay/dragCoordinator.ts)
// so a drag crossing a display boundary stays correct — this file only
// reflects whatever main broadcasts and forwards raw input (mousedown/up,
// modifier keys) back to it.
import { drawAnnotationShape, isDegenerateShape } from './annotationShapes'
import * as annotationToolbar from './annotationToolbar'
import { hideLoupe, startMagnifier, stopMagnifier, updateMagnifier } from './magnifier'
import * as textLayer from './textLayer'
import type {
  AnnotationShape,
  CaptureMode,
  OverlayResetPayload,
  OverlaySelectionStatePayload,
  PointInPoints,
  RectInPoints,
  SelectionHandleId,
  TextCaptureResultPayload
} from '../../shared/types'

const canvas = document.getElementById('overlay-canvas')
const ctx = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null
const toolbar = document.getElementById('toolbar')
const toolbarSaveBtn = document.getElementById('toolbar-save')
const textStatus = document.getElementById('text-status')
const textToolbar = document.getElementById('text-toolbar')
const textToolbarCopySelectionBtn = document.getElementById('text-toolbar-copy-selection')

let dragging = false
let textDragging = false
let shapeDrawing = false
let liveRect: RectInPoints | null = null
let selection: RectInPoints | null = null
let isToolbarHost = false
let captureMode: CaptureMode = 'region'
/** Settings' "Save screenshots to disk" toggle — hides the toolbar's Save button entirely when off (a button that can't write anything must not appear). */
let saveToDisk = true
// Inline annotation (BUILD-SPEC.md §2.4.2/§4.5a) — shapes drawn directly on
// the overlay over the finalized selection. Tied to the selection's
// lifetime: any re-finalize (a new drag, a nudge, Redo Selection) clears
// them rather than trying to keep them positioned against a moved/resized
// rect — per-shape move/resize is explicitly out of scope for this minimal
// track (that's the deferred full editor, §4.5).
let shapes: AnnotationShape[] = []
let drawingShape: AnnotationShape | null = null
const mods = { shift: false, option: false, space: false }

// Resize handles on a finalized region selection — the 4 corners + 4 edge
// midpoints. Grabbing one starts the same cross-display cursor-polling drag
// main uses for a fresh drag-out (dragCoordinator.ts's handleResizeStart),
// just anchored at the opposite corner/edge instead of the click point.
let resizingHandle: SelectionHandleId | null = null
// Set while the selection body itself is being dragged to reposition it —
// only starts when no annotation tool is active (annotationToolbar.ts).
let moving = false
const HANDLE_SIZE = 6
const HANDLE_HIT_RADIUS = 7
const HANDLE_CURSORS: Record<SelectionHandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

function handlePositions(rect: RectInPoints): Record<SelectionHandleId, PointInPoints> {
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: midX, y: rect.y },
    ne: { x: right, y: rect.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: rect.x, y: bottom },
    w: { x: rect.x, y: midY }
  }
}

function hitTestHandle(x: number, y: number, rect: RectInPoints): SelectionHandleId | null {
  const positions = handlePositions(rect)
  for (const id of Object.keys(positions) as SelectionHandleId[]) {
    const p = positions[id]
    if (Math.abs(x - p.x) <= HANDLE_HIT_RADIUS && Math.abs(y - p.y) <= HANDLE_HIT_RADIUS) return id
  }
  return null
}

function drawHandles(ctx: CanvasRenderingContext2D, rect: RectInPoints): void {
  const positions = handlePositions(rect)
  const half = HANDLE_SIZE / 2
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1
  for (const id of Object.keys(positions) as SelectionHandleId[]) {
    const p = positions[id]
    ctx.fillRect(p.x - half, p.y - half, HANDLE_SIZE, HANDLE_SIZE)
    ctx.strokeRect(Math.round(p.x - half) + 0.5, Math.round(p.y - half) + 0.5, HANDLE_SIZE - 1, HANDLE_SIZE - 1)
  }
}

function bounds(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

function resizeCanvas(): void {
  if (!(canvas instanceof HTMLCanvasElement) || !ctx) return
  // devicePixelRatio here is a Canvas API backing-store resolution concern
  // (standard HTML5 HiDPI-crispness technique), not a capture-coordinate
  // conversion — it never touches rect math or the IPC payload, both of
  // which stay in CSS-pixel/point space. Does not fall under CLAUDE.md Hard
  // Rule 3 (that's about the capture pipeline, owned by displayManager.ts).
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}

function drawBadge(rect: RectInPoints): void {
  if (!ctx) return
  const label = `${Math.round(rect.width)} × ${Math.round(rect.height)}`
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
  const paddingX = 6
  const badgeHeight = 20
  const textWidth = ctx.measureText(label).width
  const badgeWidth = textWidth + paddingX * 2

  const badgeX = rect.x
  let badgeY = rect.y - badgeHeight - 4
  if (badgeY < 0) badgeY = rect.y + 4

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight)
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, badgeX + paddingX, badgeY + badgeHeight / 2)
}

function render(): void {
  if (!ctx || !(canvas instanceof HTMLCanvasElement)) return
  // ctx is dpr-scaled (see resizeCanvas) — draw in CSS-point space, not
  // canvas.width/height (that's the larger device-pixel backing store).
  const { width, height } = bounds()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fillRect(0, 0, width, height)

  const rect = liveRect ?? selection
  // A cross-display selection's rect may fall partly or entirely outside
  // this window's own canvas — clearRect/strokeRect silently no-op past the
  // canvas edge, so no intersection check is needed here, only in main.
  if (!rect) return

  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, rect.width - 1, rect.height - 1)

  if (captureMode === 'text' && textLayer.isActive()) {
    textLayer.drawHighlights(ctx)
  } else {
    drawBadge(rect)
  }

  if (captureMode === 'region') {
    for (const shape of shapes) drawAnnotationShape(ctx, shape)
    if (drawingShape) drawAnnotationShape(ctx, drawingShape)
    // selection (not liveRect) being set already means this is the finalized,
    // non-dragging state — see onSelectionState, which always nulls exactly
    // one of the two.
    if (isToolbarHost && selection) drawHandles(ctx, selection)
  }
}

function pointInRect(x: number, y: number, rect: RectInPoints): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function showTextStatus(label: string, rect: RectInPoints): void {
  if (!textStatus) return
  textStatus.textContent = label
  textStatus.classList.add('visible')
  positionBelowSelection(textStatus, rect)
}

function hideTextStatus(): void {
  textStatus?.classList.remove('visible')
}

function hideTextToolbar(): void {
  textToolbar?.classList.remove('visible')
}

function updateCopySelectionButtonVisibility(): void {
  textToolbarCopySelectionBtn?.classList.toggle('hidden', !textLayer.hasSelection())
}

function currentModifiers(): { square: boolean; fromCenter: boolean; space: boolean } {
  return { square: mods.shift, fromCenter: mods.option, space: mods.space }
}

/**
 * Anchored below the selection, flipped above if it'd go offscreen, clamped
 * to display bounds (BUILD-SPEC.md §4.3). Lives inside the overlay window
 * itself — inherits always-on-top for free, no separate window needed. Shared
 * by the region-capture toolbar and Universal Text Capture's "Reading…"
 * status (BUILD-SPEC.md §4.9) — both anchor to the selection the same way.
 */
function positionBelowSelection(el: HTMLElement, rect: RectInPoints): void {
  const elWidth = el.offsetWidth
  const elHeight = el.offsetHeight
  const gap = 8
  const { width: boundsWidth, height: boundsHeight } = bounds()

  let left = rect.x + rect.width / 2 - elWidth / 2
  let top = rect.y + rect.height + gap
  if (top + elHeight > boundsHeight) {
    top = rect.y - elHeight - gap
  }
  top = Math.min(Math.max(top, 0), Math.max(0, boundsHeight - elHeight))
  left = Math.min(Math.max(left, 0), Math.max(0, boundsWidth - elWidth))

  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

/**
 * Right-aligned with the selection's right edge, below it (flipped above if
 * that would go offscreen) — matching Lightshot's bottom action bar, which
 * hugs the bottom-right corner rather than centering. Deliberately its own
 * function, not `positionBelowSelection`: that one's shared with Universal
 * Text Capture's "Reading…" status, which should stay centered.
 */
function positionToolbar(rect: RectInPoints): void {
  if (!toolbar) return
  toolbar.classList.add('visible')
  const toolbarWidth = toolbar.offsetWidth
  const toolbarHeight = toolbar.offsetHeight
  const gap = 8
  const { width: boundsWidth, height: boundsHeight } = bounds()

  let left = rect.x + rect.width - toolbarWidth
  let top = rect.y + rect.height + gap
  if (top + toolbarHeight > boundsHeight) {
    top = rect.y - toolbarHeight - gap
  }
  top = Math.min(Math.max(top, 0), Math.max(0, boundsHeight - toolbarHeight))
  left = Math.min(Math.max(left, 0), Math.max(0, boundsWidth - toolbarWidth))

  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

function hideToolbar(): void {
  toolbar?.classList.remove('visible')
}

function resetSelectionState(payload: OverlayResetPayload): void {
  dragging = false
  textDragging = false
  shapeDrawing = false
  resizingHandle = null
  moving = false
  liveRect = null
  selection = null
  isToolbarHost = false
  captureMode = payload.mode
  saveToDisk = payload.saveToDisk
  toolbarSaveBtn?.classList.toggle('hidden', !saveToDisk)
  shapes = []
  drawingShape = null
  if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = 'crosshair'
  hideToolbar()
  hideTextStatus()
  hideTextToolbar()
  annotationToolbar.hide()
  textLayer.clear()
  render()
  startMagnifier()
}

/** Magnifier loupe (BUILD-SPEC.md §4.2 step 3) — idle only, see magnifier.ts's header comment. */
function onIdleMouseMove(event: MouseEvent): void {
  if (dragging || selection || resizingHandle || moving) return
  updateMagnifier(event.clientX, event.clientY)
}

function onMouseMove(event: MouseEvent): void {
  if (shapeDrawing && drawingShape) {
    drawingShape = { ...drawingShape, x1: event.clientX, y1: event.clientY }
    render()
    return
  }
  if (textDragging) {
    textLayer.updateSelectionDrag(event.clientX, event.clientY)
    updateCopySelectionButtonVisibility()
    render()
    return
  }
  if (captureMode === 'text' && textLayer.isActive() && !dragging && canvas instanceof HTMLCanvasElement) {
    canvas.style.cursor = textLayer.containsPoint(event.clientX, event.clientY) ? 'text' : 'default'
  }
  if (captureMode === 'region' && isToolbarHost && selection && !resizingHandle && !moving && canvas instanceof HTMLCanvasElement) {
    const handle = hitTestHandle(event.clientX, event.clientY, selection)
    if (handle) {
      canvas.style.cursor = HANDLE_CURSORS[handle]
    } else if (pointInRect(event.clientX, event.clientY, selection)) {
      canvas.style.cursor = annotationToolbar.getActiveTool() ? 'crosshair' : 'move'
    } else {
      canvas.style.cursor = 'crosshair'
    }
  }
  onIdleMouseMove(event)
}

function onMouseDown(event: MouseEvent): void {
  // In text-capture mode, a click landing inside the already-recognized text
  // region starts a word-selection drag (textLayer.ts) instead of a brand
  // new region-select drag — clicking anywhere else starts over, same as
  // region-capture's "click elsewhere to redo" feel.
  if (captureMode === 'text' && textLayer.isActive() && textLayer.containsPoint(event.clientX, event.clientY)) {
    textDragging = true
    textLayer.startSelectionDrag(event.clientX, event.clientY)
    updateCopySelectionButtonVisibility()
    render()
    return
  }

  // Resize handles take priority over inline annotation below — a click
  // exactly on a corner/edge handle resizes the selection instead of
  // drawing a shape there.
  if (captureMode === 'region' && isToolbarHost && selection) {
    const handle = hitTestHandle(event.clientX, event.clientY, selection)
    if (handle) {
      resizingHandle = handle
      if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = HANDLE_CURSORS[handle]
      hideToolbar()
      annotationToolbar.hide()
      hideLoupe()
      window.overlayApi.startResize(handle)
      return
    }
  }

  // Inline annotation (BUILD-SPEC.md §2.4.2): once a region is finalized, a
  // click INSIDE it draws a shape with whatever tool/color is active — but
  // only when a tool IS active. No tool selected by default (see
  // annotationToolbar.ts), so a plain click-drag here instead repositions
  // the whole selection, matching Lightshot. A click OUTSIDE it still starts
  // a brand new selection either way.
  if (captureMode === 'region' && selection && pointInRect(event.clientX, event.clientY, selection)) {
    const tool = annotationToolbar.getActiveTool()
    if (tool) {
      shapeDrawing = true
      const color = annotationToolbar.getActiveColor()
      drawingShape = { tool, color, x0: event.clientX, y0: event.clientY, x1: event.clientX, y1: event.clientY }
      render()
      return
    }

    moving = true
    if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = 'move'
    hideToolbar()
    annotationToolbar.hide()
    hideLoupe()
    window.overlayApi.startMove({ x: event.clientX, y: event.clientY })
    return
  }

  const anchorInPoints: PointInPoints = { x: event.clientX, y: event.clientY }
  dragging = true
  selection = null
  isToolbarHost = false
  shapes = []
  drawingShape = null
  hideToolbar()
  hideTextStatus()
  hideTextToolbar()
  annotationToolbar.hide()
  textLayer.clear()
  hideLoupe()
  window.overlayApi.startDrag(anchorInPoints, currentModifiers())
}

function onMouseUp(): void {
  if (resizingHandle) {
    resizingHandle = null
    if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = 'crosshair'
    window.overlayApi.endDrag()
    return
  }
  if (moving) {
    moving = false
    if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = 'crosshair'
    window.overlayApi.endDrag()
    return
  }
  if (shapeDrawing) {
    shapeDrawing = false
    if (drawingShape && !isDegenerateShape(drawingShape)) {
      shapes = [...shapes, drawingShape]
      annotationToolbar.setUndoEnabled(true)
    }
    drawingShape = null
    render()
    return
  }
  if (textDragging) {
    textDragging = false
    textLayer.endSelectionDrag()
    updateCopySelectionButtonVisibility()
    return
  }
  if (!dragging) return
  dragging = false
  window.overlayApi.endDrag()
}

function onSelectionState(payload: OverlaySelectionStatePayload): void {
  if (payload.phase === 'dragging') {
    liveRect = payload.rectInPoints
    selection = null
    isToolbarHost = false
    hideToolbar()
    hideLoupe()
    render()
    return
  }

  liveRect = null
  isToolbarHost = payload.isToolbarHost
  shapes = []
  drawingShape = null
  if (payload.rectInPoints.width < 2 || payload.rectInPoints.height < 2) {
    selection = null
    hideToolbar()
    annotationToolbar.hide()
    render()
    return
  }

  selection = payload.rectInPoints
  hideLoupe()
  if (isToolbarHost) {
    if (captureMode === 'text') {
      showTextStatus('Reading…', selection)
      annotationToolbar.hide()
    } else {
      positionToolbar(selection)
      const { width: boundsWidth, height: boundsHeight } = bounds()
      annotationToolbar.show(selection, boundsWidth, boundsHeight)
      annotationToolbar.setUndoEnabled(false)
    }
  } else {
    hideToolbar()
    annotationToolbar.hide()
  }
  render()
}

function triggerCopy(): void {
  if (!selection) return
  hideToolbar()
  annotationToolbar.hide()
  window.overlayApi.copySelection(selection, shapes)
}

function triggerSave(): void {
  if (!selection) return
  hideToolbar()
  annotationToolbar.hide()
  window.overlayApi.saveSelection(selection, shapes)
}

function undoLastShape(): void {
  if (shapes.length === 0) return
  shapes = shapes.slice(0, -1)
  annotationToolbar.setUndoEnabled(shapes.length > 0)
  render()
}

function triggerCancel(): void {
  // Reset local state immediately rather than relying solely on the next
  // OVERLAY_RESET (which only fires right before the window is shown again)
  // — the window is about to hide either way, but leaving stale toolbar/
  // selection state hanging around between now and then is a needless trap.
  hideToolbar()
  hideTextStatus()
  hideTextToolbar()
  annotationToolbar.hide()
  textLayer.clear()
  selection = null
  liveRect = null
  shapes = []
  drawingShape = null
  resizingHandle = null
  moving = false
  dragging = false
  shapeDrawing = false
  textDragging = false
  window.overlayApi.dismiss()
}

/**
 * Universal Text Capture's result arriving from main (BUILD-SPEC.md §4.9) —
 * the moment recognition finishes after mouse-up. Copies everything
 * recognized and dismisses immediately, on direct request — no manual
 * "Copy All" click required for the common case of "grab all the text in
 * this area". textLayer's word-level highlight/"Copy Selection" machinery
 * (mouse-drag re-selection, ⌘C on a partial highlight) is left in place
 * further down in this file, not deleted — it's simply unreachable now that
 * the overlay closes before any of it could run. Flagging rather than
 * ripping it out: another session is actively building on this exact flow.
 */
function onTextCaptureResult(payload: TextCaptureResultPayload): void {
  hideTextStatus()
  if (payload.lines.length === 0 || !selection) {
    // Nothing recognized, or the window was reset before this arrived — main
    // already showed a native notification for that case
    // (textCaptureService.ts's "no text found"/failure paths); nothing more
    // to render here.
    return
  }
  textLayer.setResult(payload, selection)
  textLayer.selectAll()
  window.overlayApi.copyTextCapture(textLayer.getSelectedText())
  textLayer.clear()
  selection = null
  // Without this, the canvas keeps showing the last-drawn frame (this
  // selection's highlighted rect/words) until the window actually hides —
  // dismiss() is an async IPC round-trip to main, so that stale frame is
  // genuinely visible for a beat, not just theoretically possible.
  render()
  window.overlayApi.dismiss()
}

/** Copies whatever's currently highlighted. Falls back to selecting everything first when nothing's highlighted — used by both ⌘C and the "Copy Selection" button, so ⌘C always does something useful rather than silently no-op-ing. */
function triggerTextCopy(): void {
  if (!textLayer.hasSelection()) {
    textLayer.selectAll()
    updateCopySelectionButtonVisibility()
    render()
  }
  hideTextToolbar()
  window.overlayApi.copyTextCapture(textLayer.getSelectedText())
}

/** "Copy All" — always copies every recognized word, regardless of the current highlight. */
function triggerTextCopyAll(): void {
  textLayer.selectAll()
  render()
  hideTextToolbar()
  window.overlayApi.copyTextCapture(textLayer.getSelectedText())
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    triggerCancel()
    return
  }

  if (captureMode === 'text' && textLayer.isActive()) {
    if (event.metaKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      textLayer.selectAll()
      updateCopySelectionButtonVisibility()
      render()
      return
    }
    if (event.metaKey && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      triggerTextCopy()
      return
    }
    // Region-select's Enter-to-copy and arrow-key nudge don't apply here —
    // `selection` is still the finalized rect that defined the recognized
    // region, but re-copying it as an image or nudging it would be wrong
    // once text results are showing.
    return
  }

  // Guards against every gesture that keeps `selection` non-null while it's
  // still in flight — without checking resizingHandle/moving/shapeDrawing
  // too, pressing Enter mid-resize (mouse still down) would export the
  // STALE pre-resize rect (main's finalizedRectInPoints is null during an
  // active gesture, but the renderer's own `selection` isn't updated until
  // the 'finalized' broadcast after mouseup) and abort the gesture underneath
  // the user with no warning.
  const gestureInFlight = dragging || resizingHandle !== null || moving || shapeDrawing

  if (event.key === 'Enter' && selection && !gestureInFlight) {
    // Default action on Enter is a setting (most users: Copy) — hardcoded
    // until the Settings window (Phase 5) can configure it.
    event.preventDefault()
    triggerCopy()
    return
  }

  if (captureMode === 'region' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoLastShape()
    return
  }

  if (event.key === 'Shift') mods.shift = true
  if (event.key === 'Alt') mods.option = true
  if (event.key === ' ') {
    mods.space = true
    event.preventDefault()
  }
  if (dragging) {
    window.overlayApi.sendDragModifiers(currentModifiers())
  }

  if (selection && !gestureInFlight) {
    const step = event.shiftKey ? 10 : 1
    let dx = 0
    let dy = 0
    if (event.key === 'ArrowUp') dy = -step
    else if (event.key === 'ArrowDown') dy = step
    else if (event.key === 'ArrowLeft') dx = -step
    else if (event.key === 'ArrowRight') dx = step

    if (dx !== 0 || dy !== 0) {
      window.overlayApi.nudgeSelection(dx, dy)
      event.preventDefault()
    }
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Shift') mods.shift = false
  if (event.key === 'Alt') mods.option = false
  if (event.key === ' ') mods.space = false
  if (dragging) {
    window.overlayApi.sendDragModifiers(currentModifiers())
  }
}

function onVisibilityChange(): void {
  // Covers every path that hides this window (cancel, copy, save) uniformly
  // — those don't all route through a dedicated "you're being hidden" IPC
  // message, but the Page Visibility API reflects it regardless of cause.
  if (document.hidden) stopMagnifier()
}

if (canvas instanceof HTMLCanvasElement) {
  window.addEventListener('resize', resizeCanvas)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.overlayApi.onReset(resetSelectionState)
  window.overlayApi.onSelectionState(onSelectionState)
  window.overlayApi.onTextCaptureResult(onTextCaptureResult)

  document.getElementById('toolbar-copy')?.addEventListener('click', triggerCopy)
  document.getElementById('toolbar-save')?.addEventListener('click', triggerSave)
  document.getElementById('toolbar-cancel')?.addEventListener('click', triggerCancel)

  document.getElementById('text-toolbar-copy-all')?.addEventListener('click', triggerTextCopyAll)
  textToolbarCopySelectionBtn?.addEventListener('click', triggerTextCopy)
  document.getElementById('text-toolbar-cancel')?.addEventListener('click', triggerCancel)

  annotationToolbar.init({
    onToolChange: () => {},
    onColorChange: () => {},
    onUndo: undoLastShape
  })

  resizeCanvas()
}
