import { app } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isAccessibilityGranted } from '../permissions/accessibility'
import { copyImageFileToClipboard } from '../output/clipboard'
import { saveScreenshotFile } from '../output/fileWriter'
import { notifyFailure } from '../notify'
import { logger } from '../logger'
import { playCaptureSound } from './captureSound'
import { captureRegion, ScreenCaptureError } from './screencapture'
import { postScrollEvent } from './scrollSynthesis'
import { findOverlapPixels, loadRawImage, stitchScrollFrames } from './scrollStitcher'
import type { RectInPoints } from '../../shared/types'

// Orchestrates "Capture Full Page" end-to-end (BUILD-SPEC.md §3.5): repeatedly
// screenshot the selected rect, synthesize a scroll, wait for it to settle,
// and stitch the frames into one tall image. Deliberately a separate
// orchestrator from captureService.ts, not a branch inside it — this is a
// fundamentally different capture shape (a loop over time, not a single
// screencapture call or a fixed set of display segments) with its own
// failure modes (permission, no scrollable content, runaway pages).

const MAX_FRAMES = 50
const MAX_HEIGHT_PIXELS = 30_000
const SCROLL_SETTLE_POLL_INTERVAL_MS = 60
const SCROLL_SETTLE_MAX_MS = 400
// How far to scroll per tick, in CGEventCreateScrollWheelEvent "line" units
// (native/scrollhelper). Not a fixed pixel amount — how many pixels a line
// is worth varies per app — chosen empirically (Phase 0 scrolling-capture
// spike) to leave generous overlap in a typical ~600-900pt-tall selection
// without so little movement that a full page takes forever to capture.
const SCROLL_LINES_PER_TICK = 20
// Below this many new (non-overlapping) pixels, treat a scroll tick as
// having reached the bottom rather than appending a near-duplicate frame.
const MIN_NEW_CONTENT_PIXELS = 8

function scrollTargetPoint(rectInPoints: RectInPoints): { x: number; y: number } {
  return { x: rectInPoints.x + rectInPoints.width / 2, y: rectInPoints.y + rectInPoints.height / 2 }
}

async function captureFrame(rectInPoints: RectInPoints, tempDir: string, label: string): Promise<string> {
  const framePath = join(tempDir, `frame-${label}.png`)
  await captureRegion({ rectInPoints, outputPath: framePath })
  return framePath
}

/** Polls captures until two consecutive frames are pixel-identical (scroll animation settled) or a time cap is hit. Returns the last frame captured. */
async function captureSettledFrame(rectInPoints: RectInPoints, tempDir: string, tickIndex: number): Promise<string> {
  let previousPath = await captureFrame(rectInPoints, tempDir, `${tickIndex}-settle0`)
  let previousRaw = await loadRawImage(previousPath)
  const deadline = Date.now() + SCROLL_SETTLE_MAX_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_POLL_INTERVAL_MS))
    const nextPath = await captureFrame(rectInPoints, tempDir, `${tickIndex}-settle1`)
    const nextRaw = await loadRawImage(nextPath)
    if (nextRaw.data.equals(previousRaw.data)) return nextPath
    previousPath = nextPath
    previousRaw = nextRaw
  }
  return previousPath
}

interface CapturedFrames {
  tempDir: string
  framePaths: string[]
}

/**
 * Captures the frame sequence: frame 1 as-is, then repeatedly scroll +
 * settle + capture, stopping when a tick produces no meaningful new content,
 * or a hard cap is hit (runaway/infinite-scroll pages).
 */
async function captureFrameSequence(rectInPoints: RectInPoints): Promise<CapturedFrames | null> {
  if (!isAccessibilityGranted()) {
    notifyFailure(
      'Full-page capture needs Accessibility access',
      'Grant it in System Settings → Privacy & Security → Accessibility, then try again.'
    )
    return null
  }

  const tempDir = await mkdtemp(join(app.getPath('temp'), 'snapper-scroll-'))
  const framePaths: string[] = []
  const target = scrollTargetPoint(rectInPoints)

  try {
    const firstFrame = await captureFrame(rectInPoints, tempDir, '0')
    framePaths.push(firstFrame)
    let previousRaw = await loadRawImage(firstFrame)
    let totalHeightPixels = previousRaw.height

    for (let tick = 1; tick < MAX_FRAMES && totalHeightPixels < MAX_HEIGHT_PIXELS; tick++) {
      await postScrollEvent(target, SCROLL_LINES_PER_TICK)
      const framePath = await captureSettledFrame(rectInPoints, tempDir, tick)
      const raw = await loadRawImage(framePath)

      const overlap = findOverlapPixels(previousRaw, raw)
      const newContentPixels = overlap === null ? raw.height : raw.height - overlap
      if (newContentPixels < MIN_NEW_CONTENT_PIXELS) {
        // Reached the bottom — this tick's frame is (near-)identical to the
        // last, nothing new to add.
        break
      }

      framePaths.push(framePath)
      previousRaw = raw
      totalHeightPixels += newContentPixels
    }

    return { tempDir, framePaths }
  } catch (err) {
    const message = err instanceof ScreenCaptureError ? err.message : 'full-page capture failed unexpectedly'
    notifyFailure('Full-page capture failed', message, err)
    await rm(tempDir, { recursive: true, force: true })
    return null
  }
}

interface TempStitched {
  tempDir: string
  stitchedPath: string
}

async function captureAndStitchToTemp(rectInPoints: RectInPoints): Promise<TempStitched | null> {
  const captured = await captureFrameSequence(rectInPoints)
  if (!captured) return null

  const stitchedPath = join(captured.tempDir, 'stitched.png')
  try {
    await stitchScrollFrames({ framePaths: captured.framePaths, outputPath: stitchedPath })
    playCaptureSound()
    return { tempDir: captured.tempDir, stitchedPath }
  } catch (err) {
    notifyFailure('Full-page capture failed', `Could not stitch the captured frames: ${String(err)}`, err)
    await rm(captured.tempDir, { recursive: true, force: true })
    return null
  }
}

export interface ScrollingCaptureResult {
  savedPath: string
}

/**
 * Floating toolbar's "Full Page" button — both outputs by default
 * (BUILD-SPEC.md §4.4's default-both principle), same as full-screen
 * capture, rather than a separate Copy/Save choice: it's a deliberate
 * one-off action, not the everyday region-select flow those two exist for.
 */
export async function captureFullPageAndOutput(rectInPoints: RectInPoints): Promise<ScrollingCaptureResult | null> {
  const stitched = await captureAndStitchToTemp(rectInPoints)
  if (!stitched) return null

  try {
    try {
      await copyImageFileToClipboard(stitched.stitchedPath)
    } catch (err) {
      notifyFailure('Full-page capture failed', `Captured, but couldn't copy to clipboard: ${String(err)}`, err)
    }

    try {
      const savedPath = await saveScreenshotFile(stitched.stitchedPath)
      logger.info(`Full-page capture saved to ${savedPath}`)
      return { savedPath }
    } catch (err) {
      notifyFailure('Full-page capture failed', `Captured, but couldn't save to disk: ${String(err)}`, err)
      return null
    }
  } finally {
    await rm(stitched.tempDir, { recursive: true, force: true })
  }
}
