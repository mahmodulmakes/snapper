import { app, screen } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { playCaptureSound } from './captureSound'
import { globalPointToCapturePixels, planCapture, type DisplayInfo } from './displayManager'
import { captureRegion, ScreenCaptureError } from './screencapture'
import { stitchSegments } from './stitcher'
import { compositeAnnotations } from '../output/annotationOverlay'
import { copyImageFileToClipboard } from '../output/clipboard'
import { saveScreenshotFile } from '../output/fileWriter'
import { getSettingsStore } from '../settings/store'
import { logger } from '../logger'
import { notifyFailure as notifyFailureBase } from '../notify'
import type { AnnotationShape, AnnotationShapePixels, RectInPoints } from '../../shared/types'

function currentDisplayInfos(): DisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    boundsInPoints: display.bounds,
    scaleFactor: display.scaleFactor
  }))
}

export interface CaptureResult {
  savedPath: string
}

export interface TempCapture {
  tempDir: string
  tempPath: string
}

function notifyFailure(message: string): void {
  notifyFailureBase('Screenshot failed', message)
}

/** Converts drawn shapes (BUILD-SPEC.md §2.4.2), given in global points, into the captured image's own pixel space, with a stroke width scaled to the image size. */
function shapesToPixels(shapes: AnnotationShape[], captureOriginInPoints: RectInPoints, scaleFactor: number, imageWidthPixels: number, imageHeightPixels: number): AnnotationShapePixels[] {
  const lineWidthInPixels = Math.max(4, Math.round(Math.min(imageWidthPixels, imageHeightPixels) / 200))
  return shapes.map((shape) => {
    const p0 = globalPointToCapturePixels({ x: shape.x0, y: shape.y0 }, captureOriginInPoints, scaleFactor)
    const p1 = globalPointToCapturePixels({ x: shape.x1, y: shape.y1 }, captureOriginInPoints, scaleFactor)
    return { tool: shape.tool, color: shape.color, lineWidthInPixels, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y }
  })
}

/**
 * Captures to a scratch file under the app's own temp directory (Hard Rule
 * 7). Caller must clean it up. For the common case (every display the rect
 * touches shares one scaleFactor, including single-display) this is one
 * `-R` call. For a selection crossing a scaleFactor boundary, captures each
 * display's segment separately at its own native resolution and stitches
 * them (see displayManager.ts's `planCapture` and stitcher.ts).
 *
 * `shapes` (BUILD-SPEC.md §2.4.2) are optional and drawn inline on the
 * overlay before Copy/Save — when present, they're rasterized onto the
 * captured PNG in place, after the real screenshot pixels exist, never
 * before (so they always land in the output, whatever the capture backend).
 */
export async function captureToTemp(rectInPoints: RectInPoints, shapes: AnnotationShape[] = []): Promise<TempCapture | null> {
  const tempDir = await mkdtemp(join(app.getPath('temp'), 'screenshot-app-'))
  const tempPath = join(tempDir, 'capture.png')
  const plan = planCapture(rectInPoints, currentDisplayInfos())

  if (!plan.fullyCovered) {
    // Not a failure — the capture still proceeds — but part of the selection
    // fell outside every display (a staggered/non-aligned multi-monitor
    // arrangement) and will be transparent in the result. Silently returning
    // a partially-blank image would violate this project's "never fail
    // silently" rule just as much as an outright error would.
    notifyFailureBase(
      'Part of your selection was outside any display',
      "The captured image will have a transparent gap there. This usually means your displays aren't perfectly aligned in System Settings."
    )
  }

  try {
    if (plan.singleCapture) {
      await captureRegion({ rectInPoints, outputPath: tempPath })
      playCaptureSound()
    } else {
      const segmentFiles = await Promise.all(
        plan.segments.map(async (segment, index) => {
          const segmentPath = join(tempDir, `segment-${index}.png`)
          await captureRegion({ rectInPoints: segment.segmentRectInPoints, outputPath: segmentPath })
          return {
            pngPath: segmentPath,
            destXPixels: segment.destInPixels.x,
            destYPixels: segment.destInPixels.y,
            resizeToPixels: segment.resizeToPixels
          }
        })
      )

      await stitchSegments({ segments: segmentFiles, outputPath: tempPath, compositeSizeInPixels: plan.compositeSizeInPixels })
      playCaptureSound()
    }
  } catch (err) {
    const message = err instanceof ScreenCaptureError ? err.message : 'screencapture failed unexpectedly'
    notifyFailure(message)
    await rm(tempDir, { recursive: true, force: true })
    return null
  }

  if (shapes.length > 0) {
    try {
      const pixelShapes = shapesToPixels(
        shapes,
        rectInPoints,
        plan.compositeScaleFactor,
        plan.compositeSizeInPixels.width,
        plan.compositeSizeInPixels.height
      )
      await compositeAnnotations(tempPath, pixelShapes, plan.compositeSizeInPixels.width, plan.compositeSizeInPixels.height)
    } catch (err) {
      // Degrade gracefully: still return the real, un-annotated capture
      // rather than failing the whole action — losing hand-drawn shapes is
      // recoverable (redo the capture), losing the screenshot itself isn't.
      notifyFailure(`Captured, but couldn't draw annotations: ${String(err)}`)
    }
  }

  return { tempDir, tempPath }
}

/**
 * Orchestrates one capture end-to-end: screencapture -> clipboard -> disk.
 * Used for captures with no toolbar decision point (e.g. full-screen), where
 * both outputs on by default (BUILD-SPEC.md §4.4) is the right behavior —
 * unless the user has turned off disk saving entirely in Settings, in which
 * case this is clipboard-only.
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

    if (!getSettingsStore().get('saveToDisk')) return null

    try {
      const savedPath = await saveScreenshotFile(captured.tempPath, getSettingsStore().get('saveDirectory'))
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

/** The floating toolbar's "Copy" button (BUILD-SPEC.md §4.3) — clipboard only. `shapes` are whatever was drawn inline on the overlay (§2.4.2) before Copy was clicked. */
export async function captureRectAndCopy(rectInPoints: RectInPoints, shapes: AnnotationShape[] = []): Promise<void> {
  const captured = await captureToTemp(rectInPoints, shapes)
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

/**
 * The floating toolbar's "Save" button (BUILD-SPEC.md §4.3) — disk only.
 * `shapes` are whatever was drawn inline on the overlay (§2.4.2) before Save
 * was clicked. The overlay only shows this button when `saveToDisk` is on
 * (see `renderer/overlay/main.ts`'s `resetSelectionState`) — this check is
 * just defense against stale renderer state, not the primary gate.
 */
export async function captureRectAndSave(rectInPoints: RectInPoints, shapes: AnnotationShape[] = []): Promise<CaptureResult | null> {
  if (!getSettingsStore().get('saveToDisk')) {
    logger.error('captureRectAndSave called while saveToDisk is off — the toolbar should not have shown Save.')
    return null
  }

  const captured = await captureToTemp(rectInPoints, shapes)
  if (!captured) return null

  try {
    const savedPath = await saveScreenshotFile(captured.tempPath, getSettingsStore().get('saveDirectory'))
    logger.info(`Capture saved to ${savedPath}`)
    return { savedPath }
  } catch (err) {
    notifyFailure(`Captured, but couldn't save to disk: ${String(err)}`)
    return null
  } finally {
    await rm(captured.tempDir, { recursive: true, force: true })
  }
}
