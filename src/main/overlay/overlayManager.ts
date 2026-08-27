import { BrowserWindow, ipcMain, screen, type Display, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureRectAndCopy, captureRectAndSave } from '../capture/captureService'
import { getDesktopCaptureSourceId } from '../capture/desktopCaptureSource'
import {
  originForDisplayId,
  overlayLocalPointToGlobalPoint,
  overlayLocalRectToGlobalPoints,
  globalRectToOverlayLocalPoints,
  type DisplayInfo
} from '../capture/displayManager'
import { activateApp, getFrontmostAppBundleId } from '../capture/frontmostApp'
import { captureTextInRegion } from '../capture/textCaptureService'
import { copyTextToClipboard } from '../output/clipboard'
import { getSettingsStore } from '../settings/store'
import {
  getFinalizedSelection,
  handleDragEnd,
  handleDragModifiers,
  handleDragStart,
  handleMoveStart,
  handleResizeStart,
  handleSelectionNudge,
  handleSelectionRedo,
  resetDragState,
  type OverlayEntry
} from './dragCoordinator'
import { IPC } from '../ipc/channels'
import { logger } from '../logger'
import type {
  AnnotationShape,
  CaptureMode,
  OverlayExportPayload,
  RectInPoints,
  TextCaptureCopyPayload,
  TextCaptureResultPayload
} from '../../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

let overlays: OverlayEntry[] = []
let listenersRegistered = false

function preloadPath(): string {
  // electron-vite always builds preload to out/preload/*.cjs (forced CJS,
  // see electron.vite.config.ts — Electron's sandboxed preload context loads
  // scripts via Node's CJS loader and cannot execute import/export syntax),
  // in both dev and production — only the renderer is served from a dev URL.
  return join(__dirname, '../preload/overlay.cjs')
}

function overlayRendererUrl(): string {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  return devServerUrl ? `${devServerUrl}/overlay/index.html` : join(__dirname, '../renderer/overlay/index.html')
}

async function createOverlayWindow(display: Display): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    // MUST be true, not false. Phase 0 spike 3 (spikes/FINDINGS.md) found that
    // fullscreenable:false silently blocks this window from ever joining
    // another app's native-fullscreen Space, no matter what
    // visibleOnAllWorkspaces/visibleOnFullScreen settings are applied, and it
    // cannot be fixed after construction via setFullScreenable(). Safe here:
    // the window is frameless with no title bar, so there's no user-facing
    // affordance to actually fullscreen it — just never call
    // win.setFullScreen(true) ourselves.
    fullscreenable: true,
    enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath()
    }
  })

  const url = overlayRendererUrl()
  try {
    if (url.startsWith('http')) {
      await win.loadURL(url)
    } else {
      await win.loadFile(url)
    }
  } catch (err) {
    logger.error(`Overlay window for display ${display.id} failed to load its renderer.`, err)
  }

  // screen-saver level + visibleOnFullScreen: true is the confirmed-working
  // combination from spike 3 for rendering above a native-fullscreen app.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  return win
}

function destroyOverlayWindows(): void {
  for (const entry of overlays) {
    entry.window.destroy()
  }
  overlays = []
}

async function rebuildOverlayWindows(): Promise<void> {
  // A display topology change invalidates any in-flight drag's polling loop
  // (it closes over the pre-rebuild `overlays` array — see dragCoordinator.ts)
  // and the coordinates it was tracking. Cancel it before destroying windows,
  // rather than letting the poll timer keep ticking against now-destroyed
  // BrowserWindows.
  resetDragState()
  destroyOverlayWindows()
  const displays = screen.getAllDisplays()
  const windows = await Promise.all(displays.map((display) => createOverlayWindow(display)))
  overlays = displays.map((display, i) => {
    const window = windows[i]
    if (!window) throw new Error(`Overlay window missing for display ${display.id}`)
    return { displayId: display.id, window }
  })
  logger.info(`Overlay window pool rebuilt: ${overlays.length} window(s).`)
}

function rebuildOverlayWindowsSafely(): void {
  rebuildOverlayWindows().catch((err: unknown) => {
    logger.error('Failed to rebuild the overlay window pool.', err)
  })
}

/**
 * Converts a selection rect from one overlay window's local points to global
 * Electron points, using the window's DISPLAY bounds (from
 * `screen.getAllDisplays()`) as the origin — NOT `window.getBounds()`.
 * Confirmed via a ground-truth screencapture marker test (spikes/): on the
 * display hosting the menu bar, `getBounds()` misreports the window's
 * origin by the menu bar's height, even though its content genuinely
 * renders at the display's real origin. `screen.getAllDisplays()` is the
 * verified ground truth (Phase 0 spike 2).
 */
function currentDisplayInfos(): DisplayInfo[] {
  return screen.getAllDisplays().map((d) => ({ id: d.id, boundsInPoints: d.bounds, scaleFactor: d.scaleFactor }))
}

function toGlobalRect(event: IpcMainEvent, localRectInPoints: RectInPoints): RectInPoints | null {
  const entry = overlays.find((o) => o.window.webContents === event.sender)
  if (!entry) {
    logger.error('Received a toolbar action from an overlay window not in the pool.', { localRectInPoints })
    return null
  }
  const origin = originForDisplayId(entry.displayId, currentDisplayInfos())
  if (!origin) {
    logger.error(`No display found for overlay window's displayId ${entry.displayId}; dropping this action.`)
    return null
  }
  return overlayLocalRectToGlobalPoints(origin, localRectInPoints)
}

/** Converts shapes drawn inline on the overlay (BUILD-SPEC.md §2.4.2), in that window's local points, into global points — same origin lookup as `toGlobalRect`, just applied per shape endpoint. */
function toGlobalShapes(event: IpcMainEvent, localShapes: AnnotationShape[]): AnnotationShape[] {
  const entry = overlays.find((o) => o.window.webContents === event.sender)
  if (!entry) return []
  const origin = originForDisplayId(entry.displayId, currentDisplayInfos())
  if (!origin) return []
  return localShapes.map((shape) => {
    const p0 = overlayLocalPointToGlobalPoint(origin, { x: shape.x0, y: shape.y0 })
    const p1 = overlayLocalPointToGlobalPoint(origin, { x: shape.x1, y: shape.y1 })
    return { ...shape, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y }
  })
}

/** Floating toolbar's Copy button (BUILD-SPEC.md §4.3) — `shapes` are whatever the user drew inline on the selection (§2.4.2) before clicking Copy. */
async function handleCopyAction(event: IpcMainEvent, payload: OverlayExportPayload): Promise<void> {
  const globalRectInPoints = toGlobalRect(event, payload.rectInPoints)
  if (!globalRectInPoints) return
  const globalShapes = toGlobalShapes(event, payload.shapes)
  await hideOverlaysAndRestoreFocus()
  captureRectAndCopy(globalRectInPoints, globalShapes).catch((err: unknown) => {
    logger.error('Copy from region selection failed unexpectedly.', err)
  })
}

/** Floating toolbar's Save button (BUILD-SPEC.md §4.3) — `shapes` are whatever the user drew inline on the selection (§2.4.2) before clicking Save. */
async function handleSaveAction(event: IpcMainEvent, payload: OverlayExportPayload): Promise<void> {
  const globalRectInPoints = toGlobalRect(event, payload.rectInPoints)
  if (!globalRectInPoints) return
  const globalShapes = toGlobalShapes(event, payload.shapes)
  await hideOverlaysAndRestoreFocus()
  captureRectAndSave(globalRectInPoints, globalShapes).catch((err: unknown) => {
    logger.error('Save from region selection failed unexpectedly.', err)
  })
}

/**
 * Universal Text Capture (BUILD-SPEC.md §4.9): runs after `handleDragEnd`
 * finalizes a text-mode selection. Unlike region capture's Copy/Save/Annotate
 * (triggered by a renderer button click, with the rect handed back over
 * IPC), this fires automatically the moment the drag ends — matching the
 * feature's "release, and it's instantly read" framing — so it reads the
 * just-finalized rect from dragCoordinator.ts directly instead of waiting
 * for a round-trip.
 *
 * Deliberately scoped to ONE window (the toolbar-host display) — a
 * text-capture selection spanning two displays is not handled specially;
 * results are only sent to whichever display's overlay hosts the finalized
 * selection, matching how the region-capture toolbar already picks one host
 * rather than duplicating itself across every touched window.
 */
async function handleTextCaptureFinalized(): Promise<void> {
  const finalized = getFinalizedSelection()
  if (!finalized || finalized.hostDisplayId === null) return

  const hostEntry = overlays.find((entry) => entry.displayId === finalized.hostDisplayId)
  if (!hostEntry) return

  const result = await captureTextInRegion(finalized.rectInPoints)
  if (!result) {
    // textCaptureService.ts already showed a native notification (no text
    // found, or recognition failed) — just clear the host's "reading…" state.
    const emptyPayload: TextCaptureResultPayload = { lines: [] }
    hostEntry.window.webContents.send(IPC.TEXT_CAPTURE_RESULT, emptyPayload)
    return
  }

  const origin = originForDisplayId(finalized.hostDisplayId, currentDisplayInfos())
  if (!origin) return

  const payload: TextCaptureResultPayload = {
    lines: result.lines.map((line) => ({
      text: line.text,
      rectInPoints: globalRectToOverlayLocalPoints(origin, line.rectInPoints),
      words: line.words.map((word) => ({
        text: word.text,
        rectInPoints: globalRectToOverlayLocalPoints(origin, word.rectInPoints)
      }))
    }))
  }
  hostEntry.window.webContents.send(IPC.TEXT_CAPTURE_RESULT, payload)
}

/** Text-capture overlay's Cmd+C (BUILD-SPEC.md §4.9) — the recognized text is already known client-side, so this just writes it out and ends the capture, unlike Copy/Save which re-derive their output from a rect. */
function handleTextCaptureCopy(_event: IpcMainEvent, payload: TextCaptureCopyPayload): void {
  copyTextToClipboard(payload.text)
  logger.info('Text capture copied to clipboard.')
  hideOverlays()
}

/** Magnifier loupe (BUILD-SPEC.md §4.2 step 3): resolves the sender's own display's desktopCapturer source id. */
async function handleGetCaptureSourceId(event: IpcMainInvokeEvent): Promise<string | null> {
  const entry = overlays.find((o) => o.window.webContents === event.sender)
  if (!entry) return null
  return getDesktopCaptureSourceId(entry.displayId)
}

/**
 * Pre-warms one hidden overlay window per display and keeps the pool in sync
 * with display changes. Call once at app startup (BUILD-SPEC.md §3.3 —
 * creating overlay windows on hotkey press is too slow).
 */
export function initOverlayWindows(): void {
  rebuildOverlayWindowsSafely()

  if (!listenersRegistered) {
    screen.on('display-added', rebuildOverlayWindowsSafely)
    screen.on('display-removed', rebuildOverlayWindowsSafely)
    screen.on('display-metrics-changed', rebuildOverlayWindowsSafely)
    ipcMain.on(IPC.OVERLAY_DISMISS, () => hideOverlays())
    ipcMain.on(IPC.OVERLAY_ACTION_COPY, handleCopyAction)
    ipcMain.on(IPC.OVERLAY_ACTION_SAVE, handleSaveAction)
    ipcMain.on(IPC.OVERLAY_DRAG_START, (event, payload) => handleDragStart(overlays, event, payload))
    ipcMain.on(IPC.OVERLAY_DRAG_MODIFIERS, (_event, payload) => handleDragModifiers(overlays, payload))
    ipcMain.on(IPC.OVERLAY_DRAG_END, () => {
      handleDragEnd(overlays)
      if (captureMode === 'text') {
        handleTextCaptureFinalized().catch((err: unknown) => {
          logger.error('Text capture failed unexpectedly.', err)
        })
      }
    })
    ipcMain.on(IPC.OVERLAY_SELECTION_NUDGE, (_event, payload) => handleSelectionNudge(overlays, payload))
    ipcMain.on(IPC.OVERLAY_SELECTION_REDO, () => handleSelectionRedo(overlays))
    ipcMain.on(IPC.OVERLAY_RESIZE_START, (event, payload) => handleResizeStart(overlays, event, payload))
    ipcMain.on(IPC.OVERLAY_MOVE_START, (event, payload) => handleMoveStart(overlays, event, payload))
    ipcMain.on(IPC.TEXT_CAPTURE_COPY, handleTextCaptureCopy)
    ipcMain.handle(IPC.OVERLAY_GET_CAPTURE_SOURCE_ID, handleGetCaptureSourceId)
    listenersRegistered = true
  }
}

export function teardownOverlayWindows(): void {
  screen.removeListener('display-added', rebuildOverlayWindowsSafely)
  screen.removeListener('display-removed', rebuildOverlayWindowsSafely)
  screen.removeListener('display-metrics-changed', rebuildOverlayWindowsSafely)
  ipcMain.removeAllListeners(IPC.OVERLAY_DISMISS)
  ipcMain.removeAllListeners(IPC.OVERLAY_ACTION_COPY)
  ipcMain.removeAllListeners(IPC.OVERLAY_ACTION_SAVE)
  ipcMain.removeAllListeners(IPC.OVERLAY_DRAG_START)
  ipcMain.removeAllListeners(IPC.OVERLAY_DRAG_MODIFIERS)
  ipcMain.removeAllListeners(IPC.OVERLAY_DRAG_END)
  ipcMain.removeAllListeners(IPC.OVERLAY_SELECTION_NUDGE)
  ipcMain.removeAllListeners(IPC.OVERLAY_SELECTION_REDO)
  ipcMain.removeAllListeners(IPC.OVERLAY_RESIZE_START)
  ipcMain.removeAllListeners(IPC.OVERLAY_MOVE_START)
  ipcMain.removeAllListeners(IPC.TEXT_CAPTURE_COPY)
  ipcMain.removeHandler(IPC.OVERLAY_GET_CAPTURE_SOURCE_ID)
  listenersRegistered = false
  resetDragState()
  destroyOverlayWindows()
}

let frontmostAppBundleIdAtHotkey: string | null = null
let overlaysActive = false
let captureMode: CaptureMode = 'region'

/**
 * Shows every display's overlay simultaneously (BUILD-SPEC.md §4.2 steps 1
 * & 2). Recording the frontmost app MUST happen before any `focus()` call
 * below — once an overlay window is focused, the frontmost app IS this app,
 * and the original app is unrecoverable.
 *
 * Guarded against re-entrancy: the frontmost-app lookup is awaited before
 * focus() is called, so a second call arriving while the first is still
 * in-flight (rapid double-press, or hotkey + tray click) would otherwise see
 * this app's own overlay as "frontmost" and clobber the real one.
 *
 * `mode` defaults to region capture; Universal Text Capture (BUILD-SPEC.md
 * §4.9) uses the same drag-select UI and window pool via
 * `showOverlaysForTextCapture()` below — the mode is sent to every renderer
 * so mouse-up knows whether to show the region-capture toolbar or trigger
 * text recognition instead (see renderer/overlay/main.ts).
 */
export async function showOverlays(mode: CaptureMode = 'region'): Promise<void> {
  if (overlaysActive) return
  overlaysActive = true
  captureMode = mode

  frontmostAppBundleIdAtHotkey = await getFrontmostAppBundleId()
  const saveToDisk = getSettingsStore().get('saveToDisk')

  for (const entry of overlays) {
    // Clear any selection left over from the previous capture before the
    // window becomes visible again — these windows are hidden, not
    // destroyed, so renderer state persists across show/hide cycles.
    entry.window.webContents.send(IPC.OVERLAY_RESET, { mode, saveToDisk })
    entry.window.show()
    entry.window.focus()
  }
}

/** Universal Text Capture's entry point (BUILD-SPEC.md §4.9) — same overlay pool and drag UI as `showOverlays()`, different mode. */
export async function showOverlaysForTextCapture(): Promise<void> {
  return showOverlays('text')
}

function hideOverlayWindows(): void {
  overlaysActive = false
  resetDragState()
  for (const entry of overlays) {
    entry.window.hide()
  }
}

/** Hides every overlay and restores focus to whatever app was frontmost when the hotkey fired (BUILD-SPEC.md §4.2 step 7). Fire-and-forgets the focus restore — fine for Cancel/Escape and display-change rebuilds, where no capture immediately follows. */
export function hideOverlays(): void {
  hideOverlayWindows()
  const bundleId = frontmostAppBundleIdAtHotkey
  frontmostAppBundleIdAtHotkey = null
  if (bundleId) {
    activateApp(bundleId).catch((err: unknown) => {
      logger.error('Could not restore focus after hiding overlays.', err)
    })
  }
}

// Empirically, macOS needs a moment after an app is reactivated before its
// windows actually repaint in their "active" appearance (e.g. NSSwitch
// toggle tint color, dimmed by default on a non-key window) — `open -b`
// resolving only means the activation request was sent, not that the
// repaint has happened. No event exists to await that repaint directly
// (it's another app's process), so this is a pragmatic fixed delay, not a
// precise one. Revisit if it proves too short (stale-tint captures) or
// noticeably laggy in practice.
const FOCUS_RESTORE_SETTLE_MS = 150

/**
 * Hides every overlay and — unlike `hideOverlays()` — WAITS for focus
 * restoration to actually settle before resolving. Required before Copy/Save
 * capture: capturing immediately after firing (not awaiting) the
 * reactivation can photograph the target app's window still in its inactive,
 * defocused appearance. Confirmed via a real capture of macOS System
 * Settings' Accessibility pane: toggle switches lost their purple "on" tint
 * and rendered gray, because the screenshot was taken before the reactivated
 * window regained key-window status and repainted.
 */
async function hideOverlaysAndRestoreFocus(): Promise<void> {
  hideOverlayWindows()
  const bundleId = frontmostAppBundleIdAtHotkey
  frontmostAppBundleIdAtHotkey = null
  if (!bundleId) return
  await activateApp(bundleId)
  await new Promise((resolve) => setTimeout(resolve, FOCUS_RESTORE_SETTLE_MS))
}
