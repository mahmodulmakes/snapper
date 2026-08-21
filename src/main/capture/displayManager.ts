import { rectIntersection } from '../../shared/selectionMath'
import type { PointInPoints, RectInPoints } from '../../shared/types'

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

/** Converts a point reported in one overlay window's local points into global Electron points. */
export function overlayLocalPointToGlobalPoint(
  windowOriginInPoints: { x: number; y: number },
  localPointInPoints: PointInPoints
): PointInPoints {
  return {
    x: windowOriginInPoints.x + localPointInPoints.x,
    y: windowOriginInPoints.y + localPointInPoints.y
  }
}

/** Inverse of `overlayLocalRectToGlobalPoints` — converts a global rect into one overlay window's local points. */
export function globalRectToOverlayLocalPoints(
  windowOriginInPoints: { x: number; y: number },
  globalRectInPoints: RectInPoints
): RectInPoints {
  return {
    x: globalRectInPoints.x - windowOriginInPoints.x,
    y: globalRectInPoints.y - windowOriginInPoints.y,
    width: globalRectInPoints.width,
    height: globalRectInPoints.height
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

/** The bounding box of every display's bounds combined — the outer edge of the usable "virtual desktop." */
export function virtualDesktopBoundsInPoints(displays: DisplayInfo[]): RectInPoints {
  if (displays.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...displays.map((d) => d.boundsInPoints.x))
  const minY = Math.min(...displays.map((d) => d.boundsInPoints.y))
  const maxX = Math.max(...displays.map((d) => d.boundsInPoints.x + d.boundsInPoints.width))
  const maxY = Math.max(...displays.map((d) => d.boundsInPoints.y + d.boundsInPoints.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Clamps a rect so it never extends past the outer edge of the virtual
 * desktop. Needed because a cross-display drag's Option/from-center resize
 * (BUILD-SPEC.md §4.2) mirrors growth around the anchor and can otherwise
 * grow the rect past any real screen — unlike the single-window case, the OS
 * cursor itself can't be relied on to stay in bounds here since the anchor
 * and current point can be on different displays.
 */
export function clampRectToVirtualDesktop(rectInPoints: RectInPoints, displays: DisplayInfo[]): RectInPoints {
  const bounds = virtualDesktopBoundsInPoints(displays)
  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
  const x0 = clamp(rectInPoints.x, bounds.x, bounds.x + bounds.width)
  const x1 = clamp(rectInPoints.x + rectInPoints.width, bounds.x, bounds.x + bounds.width)
  const y0 = clamp(rectInPoints.y, bounds.y, bounds.y + bounds.height)
  const y1 = clamp(rectInPoints.y + rectInPoints.height, bounds.y, bounds.y + bounds.height)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export interface DisplayInfo {
  id: number
  boundsInPoints: RectInPoints
  scaleFactor: number
}

export interface CaptureSegmentPlan {
  displayId: number
  /** The portion of the selection on this display, in global points — pass straight to `-R`. */
  segmentRectInPoints: RectInPoints
  /** Where this segment's captured pixels land in the composite image. */
  destInPixels: { x: number; y: number }
  /** Size to resize this segment's captured PNG to before compositing (equals its native captured size when this display is already at the composite's scale). */
  resizeToPixels: PixelDimensions
}

export interface CapturePlan {
  /** True when every touched display shares one scaleFactor (the common case, including single-display) — a single `-R` call over the full rect is correct and no stitching is needed. */
  singleCapture: boolean
  segments: CaptureSegmentPlan[]
  compositeSizeInPixels: PixelDimensions
}

/**
 * Plans how to capture a (possibly cross-display) global rect.
 *
 * Phase 0 spike 4 (spikes/FINDINGS.md) found that a single `-R` call spanning
 * two displays of different scaleFactor always comes back at the LOWER of
 * the two — confirmed to trigger from a few points of overlap, not just a
 * majority share. So: when every display the rect touches shares one
 * scaleFactor, a single capture is correct and cheapest. When they differ,
 * this splits the rect into one segment per touched display so each can be
 * captured at its own native resolution, using the HIGHEST scaleFactor
 * among them as the composite's target — a lower-scale segment gets
 * upscaled to fit, never the higher-scale segment downscaled.
 */
export function planCapture(rectInPoints: RectInPoints, displays: DisplayInfo[]): CapturePlan {
  const touched = displays
    .map((display) => ({ display, intersection: rectIntersection(rectInPoints, display.boundsInPoints) }))
    .filter(
      (touch): touch is { display: DisplayInfo; intersection: RectInPoints } => touch.intersection !== null
    )

  const scaleFactors = touched.map((touch) => touch.display.scaleFactor)
  const compositeScaleFactor = scaleFactors.length > 0 ? Math.max(...scaleFactors) : 1
  const compositeSizeInPixels = expectedPixelDimensions(rectInPoints, compositeScaleFactor)

  const allSameScale = scaleFactors.every((factor) => factor === compositeScaleFactor)
  if (allSameScale) {
    return { singleCapture: true, segments: [], compositeSizeInPixels }
  }

  const segments: CaptureSegmentPlan[] = touched.map(({ display, intersection }) => ({
    displayId: display.id,
    segmentRectInPoints: intersection,
    destInPixels: {
      x: Math.round((intersection.x - rectInPoints.x) * compositeScaleFactor),
      y: Math.round((intersection.y - rectInPoints.y) * compositeScaleFactor)
    },
    resizeToPixels: expectedPixelDimensions(intersection, compositeScaleFactor)
  }))

  return { singleCapture: false, segments, compositeSizeInPixels }
}
