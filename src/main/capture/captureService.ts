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

function notifyFailure(message: string): void {
  logger.error(message)
  // CLAUDE.md: never let a failure be silent. Guarded because Notification
  // support depends on OS/user settings, not just platform.
  if (Notification.isSupported()) {
    new Notification({ title: 'Screenshot failed', body: message }).show()
  }
}

/**
 * Orchestrates one capture end-to-end: screencapture -> clipboard -> disk.
 * Both outputs are on by default (BUILD-SPEC.md §4.4). Writes to a scratch
 * file under the app's own temp directory first (Hard Rule 7), then copies
 * into the real save folder — never the reverse, so a failed save never
 * leaves a partial file where the user expects a finished screenshot.
 */
export async function captureRectAndOutput(rectInPoints: RectInPoints): Promise<CaptureResult | null> {
  const tempDir = await mkdtemp(join(app.getPath('temp'), 'screenshot-app-'))
  const tempPath = join(tempDir, 'capture.png')

  try {
    try {
      await captureRegion({ rectInPoints, outputPath: tempPath })
    } catch (err) {
      const message = err instanceof ScreenCaptureError ? err.message : 'screencapture failed unexpectedly'
      notifyFailure(message)
      return null
    }

    try {
      await copyImageFileToClipboard(tempPath)
    } catch (err) {
      notifyFailure(`Captured, but couldn't copy to clipboard: ${String(err)}`)
    }

    try {
      const savedPath = await saveScreenshotFile(tempPath)
      logger.info(`Capture saved to ${savedPath}`)
      return { savedPath }
    } catch (err) {
      notifyFailure(`Captured, but couldn't save to disk: ${String(err)}`)
      return null
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
