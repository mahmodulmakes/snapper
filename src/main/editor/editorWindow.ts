import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TempCapture } from '../capture/captureService'
import { IPC } from '../ipc/channels'
import { logger } from '../logger'
import { notifyFailure } from '../notify'
import { copyImageFileToClipboard } from '../output/clipboard'
import { saveScreenshotFile } from '../output/fileWriter'
import type { EditorExportPayload, EditorImagePayload } from '../../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null
let pending: TempCapture | null = null
let listenersRegistered = false

function preloadPath(): string {
  return join(__dirname, '../preload/editor.cjs')
}

function rendererUrl(): string {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  return devServerUrl ? `${devServerUrl}/editor/index.html` : join(__dirname, '../renderer/editor/index.html')
}

/**
 * Points, not pixels — this reads `workAreaSize` and clamps against it, never
 * multiplies/divides by a `scaleFactor`. Hard Rule 3 is about the capture
 * coordinate pipeline; sizing a window as a fraction of screen points doesn't
 * touch it.
 */
function initialWindowSize(): { width: number; height: number } {
  const work = screen.getPrimaryDisplay().workAreaSize
  return {
    width: Math.min(1100, Math.round(work.width * 0.85)),
    height: Math.min(800, Math.round(work.height * 0.85))
  }
}

async function cleanupPending(): Promise<void> {
  const capture = pending
  pending = null
  if (!capture) return
  await rm(capture.tempDir, { recursive: true, force: true }).catch((err: unknown) => {
    logger.error('Could not clean up the annotation editor temp capture.', err)
  })
}

function decodePngDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  const base64 = match?.[1]
  if (!base64) throw new Error('Expected a base64-encoded PNG data URL from the editor.')
  return Buffer.from(base64, 'base64')
}

async function handleGetImage(): Promise<EditorImagePayload | null> {
  if (!pending) return null
  try {
    const buffer = await readFile(pending.tempPath)
    return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}` }
  } catch (err) {
    notifyFailure('Could not open the annotation editor', `Could not read the captured image: ${String(err)}`)
    return null
  }
}

async function handleExportCopy(_event: IpcMainInvokeEvent, payload: EditorExportPayload): Promise<void> {
  const capture = pending
  if (!capture) return
  try {
    await writeFile(capture.tempPath, decodePngDataUrl(payload.pngDataUrl))
    await copyImageFileToClipboard(capture.tempPath)
    logger.info('Annotated capture copied to clipboard.')
  } catch (err) {
    notifyFailure('Could not copy the annotated screenshot', String(err))
  } finally {
    await cleanupPending()
    win?.close()
  }
}

async function handleExportSave(_event: IpcMainInvokeEvent, payload: EditorExportPayload): Promise<void> {
  const capture = pending
  if (!capture) return
  try {
    await writeFile(capture.tempPath, decodePngDataUrl(payload.pngDataUrl))
    const savedPath = await saveScreenshotFile(capture.tempPath)
    logger.info(`Annotated capture saved to ${savedPath}`)
  } catch (err) {
    notifyFailure('Could not save the annotated screenshot', String(err))
  } finally {
    await cleanupPending()
    win?.close()
  }
}

async function handleCancel(): Promise<void> {
  await cleanupPending()
  win?.close()
}

function registerListeners(): void {
  if (listenersRegistered) return
  ipcMain.handle(IPC.EDITOR_GET_IMAGE, handleGetImage)
  ipcMain.on(IPC.EDITOR_EXPORT_COPY, (event, payload: EditorExportPayload) => {
    handleExportCopy(event, payload).catch((err: unknown) => {
      logger.error('Editor copy-export failed unexpectedly.', err)
    })
  })
  ipcMain.on(IPC.EDITOR_EXPORT_SAVE, (event, payload: EditorExportPayload) => {
    handleExportSave(event, payload).catch((err: unknown) => {
      logger.error('Editor save-export failed unexpectedly.', err)
    })
  })
  ipcMain.on(IPC.EDITOR_CANCEL, () => {
    handleCancel().catch((err: unknown) => {
      logger.error('Editor cancel cleanup failed unexpectedly.', err)
    })
  })
  listenersRegistered = true
}

/**
 * Opens the annotation editor on a capture that's already sitting in a temp
 * file (BUILD-SPEC.md §2.4.2). One editor session at a time — if it's already
 * open, the new capture is discarded and the existing window is focused
 * rather than replacing a session the user may be mid-edit on.
 */
export function openEditorForCapture(capture: TempCapture): void {
  registerListeners()

  if (win) {
    win.show()
    win.focus()
    rm(capture.tempDir, { recursive: true, force: true }).catch((err: unknown) => {
      logger.error('Could not discard a second concurrent annotation capture.', err)
    })
    return
  }

  pending = capture
  const { width, height } = initialWindowSize()
  win = new BrowserWindow({
    width,
    height,
    minWidth: 480,
    minHeight: 360,
    title: 'Annotate',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath()
    }
  })

  const url = rendererUrl()
  const loaded = url.startsWith('http') ? win.loadURL(url) : win.loadFile(url)
  loaded.catch((err: unknown) => {
    logger.error('Editor window failed to load its renderer.', err)
  })

  win.on('closed', () => {
    win = null
    // Covers the OS close button / Cmd+W as well as the explicit
    // Cancel/Copy/Save paths above (a no-op there — pending is already null).
    cleanupPending().catch((err: unknown) => {
      logger.error('Could not clean up after the editor window closed.', err)
    })
  })
}

export function teardownEditor(): void {
  ipcMain.removeHandler(IPC.EDITOR_GET_IMAGE)
  ipcMain.removeAllListeners(IPC.EDITOR_EXPORT_COPY)
  ipcMain.removeAllListeners(IPC.EDITOR_EXPORT_SAVE)
  ipcMain.removeAllListeners(IPC.EDITOR_CANCEL)
  listenersRegistered = false
  win?.close()
  win = null
  cleanupPending().catch((err: unknown) => {
    logger.error('Could not clean up pending editor capture during teardown.', err)
  })
}
