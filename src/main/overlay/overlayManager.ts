import { BrowserWindow, ipcMain, screen, type Display, type IpcMainEvent } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureRectAndOutput } from '../capture/captureService'
import { overlayLocalRectToGlobalPoints } from '../capture/displayManager'
import { IPC } from '../ipc/channels'
import { logger } from '../logger'
import type { RectInPoints } from '../../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface OverlayEntry {
  displayId: number
  window: BrowserWindow
}

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
 * A selection was finalized in one overlay window. Converts it from that
 * window's local points to global Electron points and captures it —
 * clipboard + disk, both on by default (BUILD-SPEC.md §4.4). There's no
 * floating toolbar yet (Phase 4) to offer Copy/Save/Cancel as separate
 * choices, so mouse-up captures immediately; that gap closes once the
 * toolbar exists.
 */
function handleSelectionComplete(event: IpcMainEvent, localRectInPoints: RectInPoints): void {
  const entry = overlays.find((o) => o.window.webContents === event.sender)
  if (!entry) {
    logger.error('Received a selection from an overlay window not in the pool.', { localRectInPoints })
    return
  }
  const windowOriginInPoints = entry.window.getBounds()
  const globalRectInPoints = overlayLocalRectToGlobalPoints(windowOriginInPoints, localRectInPoints)
  hideOverlays()
  captureRectAndOutput(globalRectInPoints).catch((err: unknown) => {
    logger.error('Capture from region selection failed unexpectedly.', err)
  })
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
    ipcMain.on(IPC.OVERLAY_SELECTION_COMPLETE, handleSelectionComplete)
    listenersRegistered = true
  }
}

export function teardownOverlayWindows(): void {
  screen.removeListener('display-added', rebuildOverlayWindowsSafely)
  screen.removeListener('display-removed', rebuildOverlayWindowsSafely)
  screen.removeListener('display-metrics-changed', rebuildOverlayWindowsSafely)
  ipcMain.removeAllListeners(IPC.OVERLAY_DISMISS)
  ipcMain.removeAllListeners(IPC.OVERLAY_SELECTION_COMPLETE)
  listenersRegistered = false
  destroyOverlayWindows()
}

/** Shows every display's overlay simultaneously (BUILD-SPEC.md §4.2 step 2). */
export function showOverlays(): void {
  for (const entry of overlays) {
    // Clear any selection left over from the previous capture before the
    // window becomes visible again — these windows are hidden, not
    // destroyed, so renderer state persists across show/hide cycles.
    entry.window.webContents.send(IPC.OVERLAY_RESET)
    entry.window.show()
    entry.window.focus()
  }
}

export function hideOverlays(): void {
  for (const entry of overlays) {
    entry.window.hide()
  }
}
