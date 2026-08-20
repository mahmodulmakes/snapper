import { app, Notification } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { captureRegion, ScreenCaptureError } from './screencapture'
import { copyImageFileToClipboard } from '../output/clipboard'
import { saveScreenshotFile } from '../output/fileWriter'
import { logger } from '../logger'
import type { RectInPoints } from '../../shared/types'

export interface CaptureResult {
  savedPath: string
}

interface TempCapture {
  tempDir: string
  tempPath: string
}

function notifyFailure(message: string): void {
  logger.error(message)
  // CLAUDE.md: never let a failure be silent. Guarded because Notification
  // support depends on OS/user settings, not just platform.
  if (Notification.isSupported()) {
    new Notification({ title: 'Screenshot failed', body: message }).show()
  }
}

/** Captures to a scratch file under the app's own temp directory (Hard Rule 7). Caller must clean it up. */
async function captureToTemp(rectInPoints: RectInPoints): Promise<TempCapture | null> {
  const tempDir = await mkdtemp(join(app.getPath('temp'), 'screenshot-app-'))
  const tempPath = join(tempDir, 'capture.png')
  try {
    await captureRegion({ rectInPoints, outputPath: tempPath })
    return { tempDir, tempPath }
  } catch (err) {
    const message = err instanceof ScreenCaptureError ? err.message : 'screencapture failed unexpectedly'
    notifyFailure(message)
    await rm(tempDir, { recursive: true, force: true })
    return null
  }
}

/**
 * Orchestrates one capture end-to-end: screencapture -> clipboard -> disk.
 * Used for captures with no toolbar decision point (e.g. full-screen), where
 * both outputs on by default (BUILD-SPEC.md §4.4) is the right behavior.
 */
export async function captureRectAndOutput(rectInPoints: RectInPoints): Promise<CaptureResult | null> {
  const captured = await captureToTemp(rectInPoints)
  if (!captured) return null

  try {
    try {
      await copyImageFileToClipboard(captured.tempPath)
    } catch (err) {
      notifyFailure(`Captured, but couldn't copy to clipboard: ${String(err)}`)
    }

    try {
      const savedPath = await saveScreenshotFile(captured.tempPath)
      logger.info(`Capture saved to ${savedPath}`)
      return { savedPath }
    } catch (err) {
      notifyFailure(`Captured, but couldn't save to disk: ${String(err)}`)
      return null
    }
  } finally {
    await rm(captured.tempDir, { recursive: true, force: true })
  }
}

/** The floating toolbar's "Copy" button (BUILD-SPEC.md §4.3) — clipboard only. */
export async function captureRectAndCopy(rectInPoints: RectInPoints): Promise<void> {
  const captured = await captureToTemp(rectInPoints)
  if (!captured) return

  try {
    await copyImageFileToClipboard(captured.tempPath)
    logger.info('Capture copied to clipboard.')
  } catch (err) {
    notifyFailure(`Captured, but couldn't copy to clipboard: ${String(err)}`)
  } finally {
    await rm(captured.tempDir, { recursive: true, force: true })
  }
}

/** The floating toolbar's "Save" button (BUILD-SPEC.md §4.3) — disk only. */
export async function captureRectAndSave(rectInPoints: RectInPoints): Promise<CaptureResult | null> {
  const captured = await captureToTemp(rectInPoints)
  if (!captured) return null

  try {
    const savedPath = await saveScreenshotFile(captured.tempPath)
    logger.info(`Capture saved to ${savedPath}`)
    return { savedPath }
  } catch (err) {
    notifyFailure(`Captured, but couldn't save to disk: ${String(err)}`)
    return null
  } finally {
    await rm(captured.tempDir, { recursive: true, force: true })
  }
}
