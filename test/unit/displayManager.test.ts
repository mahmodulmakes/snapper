import { describe, expect, it } from 'vitest'
import {
  clampRectToVirtualDesktop,
  globalRectToOverlayLocalPoints,
  overlayLocalPointToGlobalPoint,
  overlayLocalRectToGlobalPoints,
  planCapture,
  virtualDesktopBoundsInPoints,
  type DisplayInfo
} from '../../src/main/capture/displayManager'

describe('overlayLocalRectToGlobalPoints', () => {
  it('passes width/height through unchanged and offsets x/y by the window origin', () => {
    const result = overlayLocalRectToGlobalPoints({ x: 0, y: 0 }, { x: 100, y: 50, width: 200, height: 150 })
    expect(result).toEqual({ x: 100, y: 50, width: 200, height: 150 })
  })

  it('handles a display positioned to the right of the primary (positive origin)', () => {
    const result = overlayLocalRectToGlobalPoints({ x: 1470, y: 0 }, { x: 10, y: 10, width: 300, height: 200 })
    expect(result).toEqual({ x: 1480, y: 10, width: 300, height: 200 })
  })

  it('handles a display positioned to the left of the primary (negative origin)', () => {
    const result = overlayLocalRectToGlobalPoints({ x: -1200, y: 0 }, { x: 10, y: 10, width: 300, height: 200 })
    expect(result).toEqual({ x: -1190, y: 10, width: 300, height: 200 })
  })

  it('handles a display positioned above the primary (negative y origin)', () => {
    const result = overlayLocalRectToGlobalPoints({ x: 0, y: -900 }, { x: 5, y: 5, width: 100, height: 100 })
    expect(result).toEqual({ x: 5, y: -895, width: 100, height: 100 })
  })

  it('handles a display rotated 90° (Electron already swaps bounds.width/height for rotation, so this function needs no rotation-specific math)', () => {
    // A 1920x1080 display rotated 90° reports bounds as 1080 wide; stacked
    // below a 1920x1080 primary its origin is {x: 0, y: 1080}.
    const result = overlayLocalRectToGlobalPoints({ x: 0, y: 1080 }, { x: 20, y: 30, width: 400, height: 600 })
    expect(result).toEqual({ x: 20, y: 1110, width: 400, height: 600 })
  })
})

describe('overlayLocalPointToGlobalPoint', () => {
  it('offsets a point by the window origin', () => {
    expect(overlayLocalPointToGlobalPoint({ x: 0, y: -1080 }, { x: 12, y: 34 })).toEqual({ x: 12, y: -1046 })
  })
})

describe('globalRectToOverlayLocalPoints', () => {
  it('is the inverse of overlayLocalRectToGlobalPoints', () => {
    const origin = { x: -1200, y: 0 }
    const localRect = { x: 10, y: 10, width: 300, height: 200 }
    const global = overlayLocalRectToGlobalPoints(origin, localRect)
    expect(globalRectToOverlayLocalPoints(origin, global)).toEqual(localRect)
  })

  it('offsets x/y back by the window origin, leaving width/height unchanged', () => {
    const result = globalRectToOverlayLocalPoints({ x: 0, y: -1080 }, { x: 50, y: -50, width: 300, height: 100 })
    expect(result).toEqual({ x: 50, y: 1030, width: 300, height: 100 })
  })
})

// Mirrors the real two-display hardware used for spikes/FINDINGS.md's
// spikes 2 and 4: Retina built-in (primary) above/right, external 1080p
// positioned directly above it (negative-y origin, mixed scaleFactor).
const RETINA_DISPLAY: DisplayInfo = { id: 1, boundsInPoints: { x: 0, y: 0, width: 1470, height: 956 }, scaleFactor: 2 }
const EXTERNAL_DISPLAY: DisplayInfo = { id: 3, boundsInPoints: { x: 0, y: -1080, width: 1920, height: 1080 }, scaleFactor: 1 }

describe('virtualDesktopBoundsInPoints', () => {
  it('returns the bounding box of every display combined', () => {
    // RETINA spans y in [0, 956], EXTERNAL spans y in [-1080, 0] — combined
    // outer edge is y in [-1080, 956], height 2036 (they aren't vertically
    // adjacent with no gap; this is just the two displays' real bounds).
    const result = virtualDesktopBoundsInPoints([RETINA_DISPLAY, EXTERNAL_DISPLAY])
    expect(result).toEqual({ x: 0, y: -1080, width: 1920, height: 2036 })
  })

  it('returns a zero rect for no displays', () => {
    expect(virtualDesktopBoundsInPoints([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('clampRectToVirtualDesktop', () => {
  it('leaves a rect that already fits within the virtual desktop untouched', () => {
    const rect = { x: 50, y: -50, width: 300, height: 100 }
    expect(clampRectToVirtualDesktop(rect, [RETINA_DISPLAY, EXTERNAL_DISPLAY])).toEqual(rect)
  })

  it('pulls a rect back when Option/from-center growth pushes it past every real display', () => {
    // fromCenter resize can grow a rect symmetrically around the anchor,
    // overshooting past any real screen on the far side.
    const rect = { x: -200, y: -1200, width: 2400, height: 1400 }
    const result = clampRectToVirtualDesktop(rect, [RETINA_DISPLAY, EXTERNAL_DISPLAY])
    expect(result).toEqual({ x: 0, y: -1080, width: 1920, height: 1280 })
  })
})

describe('planCapture', () => {
  it('single display: always a single capture', () => {
    const plan = planCapture({ x: 100, y: 100, width: 200, height: 150 }, [RETINA_DISPLAY])
    expect(plan.singleCapture).toBe(true)
    expect(plan.segments).toEqual([])
    expect(plan.compositeSizeInPixels).toEqual({ width: 400, height: 300 })
  })

  it('two displays sharing one scaleFactor: single capture even though the rect spans both', () => {
    const sameScaleExternal: DisplayInfo = { ...EXTERNAL_DISPLAY, scaleFactor: 2 }
    const rect = { x: 50, y: -50, width: 300, height: 100 }
    const plan = planCapture(rect, [RETINA_DISPLAY, sameScaleExternal])
    expect(plan.singleCapture).toBe(true)
    expect(plan.compositeSizeInPixels).toEqual({ width: 600, height: 200 })
  })

  it('a rect entirely off every display still resolves to a 1x single capture rather than throwing', () => {
    const plan = planCapture({ x: 5000, y: 5000, width: 100, height: 100 }, [RETINA_DISPLAY, EXTERNAL_DISPLAY])
    expect(plan.singleCapture).toBe(true)
    expect(plan.compositeSizeInPixels).toEqual({ width: 100, height: 100 })
  })

  it('spike 4: a rect spanning displays of different scaleFactor splits into per-display segments at the highest scaleFactor touched', () => {
    // Same shape as the real spike run: 50pt on the external (1x) display, 50pt on the Retina (2x) display.
    const rect = { x: 50, y: -50, width: 300, height: 100 }
    const plan = planCapture(rect, [RETINA_DISPLAY, EXTERNAL_DISPLAY])

    expect(plan.singleCapture).toBe(false)
    expect(plan.compositeSizeInPixels).toEqual({ width: 600, height: 200 }) // 2x, not the lower 1x

    const externalSegment = plan.segments.find((s) => s.displayId === EXTERNAL_DISPLAY.id)
    const retinaSegment = plan.segments.find((s) => s.displayId === RETINA_DISPLAY.id)
    expect(externalSegment?.segmentRectInPoints).toEqual({ x: 50, y: -50, width: 300, height: 50 })
    expect(retinaSegment?.segmentRectInPoints).toEqual({ x: 50, y: 0, width: 300, height: 50 })

    // External segment (native 1x) gets upscaled 2x to match the composite; Retina segment is already native.
    expect(externalSegment?.resizeToPixels).toEqual({ width: 600, height: 100 })
    expect(retinaSegment?.resizeToPixels).toEqual({ width: 600, height: 100 })

    // External segment lands at the top of the composite (y=0), Retina segment right below it (y=100px = 50pt * 2x).
    expect(externalSegment?.destInPixels).toEqual({ x: 0, y: 0 })
    expect(retinaSegment?.destInPixels).toEqual({ x: 0, y: 100 })
  })

  it('a rect touching the lower-scale display by only a sliver still splits into segments (spike 4: no majority-share exemption)', () => {
    const rect = { x: 50, y: -5, width: 300, height: 100 }
    const plan = planCapture(rect, [RETINA_DISPLAY, EXTERNAL_DISPLAY])
    expect(plan.singleCapture).toBe(false)
    expect(plan.segments).toHaveLength(2)
  })
})
