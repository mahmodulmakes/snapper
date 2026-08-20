import type { RectInPoints } from '../../shared/types'

// The ONLY file allowed to touch coordinate/scaleFactor conversion
// (CLAUDE.md Hard Rule 3, BUILD-SPEC.md §3.2). Nothing here multiplies or
// divides by scaleFactor yet — that lands in Phase 2 alongside
// screencapture.ts, once captures actually need pixel-space rects. For now
// this owns the one conversion Phase 3's overlay needs: translating a
// selection rect from a single overlay window's local points into global
// Electron points, by adding that window's screen origin.

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
