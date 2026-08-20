import type { RectInPoints } from '../../shared/types'

// The ONLY file allowed to touch coordinate/scaleFactor conversion
// (CLAUDE.md Hard Rule 3, BUILD-SPEC.md §3.2).

/**
 * Converts a rect reported in one overlay window's local points into global
 * Electron points, given that window's origin (its display's `bounds.x/y`).
 */
export function overlayLocalRectToGlobalPoints(
  windowOriginInPoints: { x: number; y: number },
  localRectInPoints: RectInPoints
): RectInPoints {
  return {
    x: windowOriginInPoints.x + localRectInPoints.x,
    y: windowOriginInPoints.y + localRectInPoints.y,
    width: localRectInPoints.width,
    height: localRectInPoints.height
  }
}

export interface PixelDimensions {
  width: number
  height: number
}

/**
 * What a captured PNG's pixel dimensions should be for a rect on a display
 * with the given scaleFactor. Phase 0 spike 1 confirmed `screencapture -R`
 * takes points in and returns native (scaleFactor-multiplied) pixels out —
 * this is for validating that a capture's actual output matches, not for
 * building the `-R` argument itself (that stays in points, unmodified).
 */
export function expectedPixelDimensions(rectInPoints: RectInPoints, scaleFactor: number): PixelDimensions {
  return {
    width: Math.round(rectInPoints.width * scaleFactor),
    height: Math.round(rectInPoints.height * scaleFactor)
  }
}
