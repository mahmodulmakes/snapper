import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RectInPoints } from '../../shared/types'

const execFileAsync = promisify(execFile)

const SCREENCAPTURE_BIN = '/usr/sbin/screencapture'

export class ScreenCaptureError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause })
    this.name = 'ScreenCaptureError'
  }
}

/** Builds the `-R x,y,w,h` argument for a rect, in Electron global points. */
export function buildRegionSpec(rectInPoints: RectInPoints): string {
  return [rectInPoints.x, rectInPoints.y, rectInPoints.width, rectInPoints.height].map(Math.round).join(',')
}

export interface CaptureRegionOptions {
  rectInPoints: RectInPoints
  outputPath: string
}

/**
 * Captures a rectangle to a PNG file. `rectInPoints` is passed straight to
 * `-R` unmodified — Phase 0 spike 1 (spikes/FINDINGS.md) confirmed `-R`
 * takes Electron's global points as input and returns native pixels as
 * output, so no scaleFactor conversion happens here. A full-display capture
 * is just a rect equal to that display's full bounds — no need for `-D`,
 * which would require mapping Electron display ids to screencapture's
 * ambiguous enumeration-order index.
 */
export async function captureRegion({ rectInPoints, outputPath }: CaptureRegionOptions): Promise<void> {
  const spec = buildRegionSpec(rectInPoints)
  try {
    await execFileAsync(SCREENCAPTURE_BIN, ['-x', '-R', spec, '-t', 'png', outputPath])
  } catch (err) {
    throw new ScreenCaptureError(`screencapture -R ${spec} failed`, err)
  }
}
