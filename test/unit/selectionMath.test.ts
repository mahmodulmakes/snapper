import { describe, expect, it } from 'vitest'
import { clampRectToBounds, computeDragRect, nudgeRect, rectIntersection, translateRect } from '../../src/shared/selectionMath'

describe('computeDragRect', () => {
  it('computes a plain rect dragging down-right', () => {
    const rect = computeDragRect({ x: 100, y: 100 }, { x: 300, y: 250 }, { square: false, fromCenter: false })
    expect(rect).toEqual({ x: 100, y: 100, width: 200, height: 150 })
  })

  it('computes a plain rect dragging up-left (anchor stays the max corner)', () => {
    const rect = computeDragRect({ x: 300, y: 250 }, { x: 100, y: 100 }, { square: false, fromCenter: false })
    expect(rect).toEqual({ x: 100, y: 100, width: 200, height: 150 })
  })

  it('constrains to a square using the larger delta, preserving direction', () => {
    const rect = computeDragRect({ x: 0, y: 0 }, { x: 200, y: 50 }, { square: true, fromCenter: false })
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  it('constrains to a square when dragging up-left', () => {
    const rect = computeDragRect({ x: 200, y: 200 }, { x: 100, y: 150 }, { square: true, fromCenter: false })
    expect(rect).toEqual({ x: 100, y: 100, width: 100, height: 100 })
  })

  it('resizes from center when fromCenter is set', () => {
    const rect = computeDragRect({ x: 100, y: 100 }, { x: 150, y: 130 }, { square: false, fromCenter: true })
    expect(rect).toEqual({ x: 50, y: 70, width: 100, height: 60 })
  })

  it('combines square + fromCenter', () => {
    const rect = computeDragRect({ x: 100, y: 100 }, { x: 150, y: 130 }, { square: true, fromCenter: true })
    // larger delta is 50 (x), so both axes use 50 -> full side 100, centered on anchor
    expect(rect).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  })
})

describe('translateRect', () => {
  it('moves a rect by the delta between anchor and current, preserving size', () => {
    const base = { x: 100, y: 100, width: 200, height: 150 }
    const rect = translateRect(base, { x: 300, y: 300 }, { x: 320, y: 290 })
    expect(rect).toEqual({ x: 120, y: 90, width: 200, height: 150 })
  })
})

describe('nudgeRect', () => {
  it('shifts x/y by the given delta, preserving size', () => {
    const rect = nudgeRect({ x: 10, y: 10, width: 50, height: 40 }, 1, -10)
    expect(rect).toEqual({ x: 11, y: 0, width: 50, height: 40 })
  })
})

describe('clampRectToBounds', () => {
  const bounds = { width: 1000, height: 800 }

  it('leaves a rect that already fits untouched', () => {
    const rect = clampRectToBounds({ x: 100, y: 100, width: 200, height: 150 }, bounds)
    expect(rect).toEqual({ x: 100, y: 100, width: 200, height: 150 })
  })

  it('pulls a rect back into bounds when it overshoots the right/bottom edge', () => {
    const rect = clampRectToBounds({ x: 900, y: 700, width: 200, height: 150 }, bounds)
    expect(rect).toEqual({ x: 800, y: 650, width: 200, height: 150 })
  })

  it('pulls a rect back into bounds when it starts off the left/top edge', () => {
    const rect = clampRectToBounds({ x: -50, y: -30, width: 200, height: 150 }, bounds)
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 150 })
  })

  it('shrinks a rect wider/taller than the bounds themselves', () => {
    const rect = clampRectToBounds({ x: 0, y: 0, width: 1500, height: 1200 }, bounds)
    expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 800 })
  })
})

describe('rectIntersection', () => {
  it('returns the overlapping area of two overlapping rects', () => {
    const result = rectIntersection({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })
    expect(result).toEqual({ x: 50, y: 50, width: 50, height: 50 })
  })

  it('returns null for rects that do not touch at all', () => {
    const result = rectIntersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 100, width: 10, height: 10 })
    expect(result).toBeNull()
  })

  it('returns null for rects that only touch at an edge (zero-area overlap)', () => {
    const result = rectIntersection({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 })
    expect(result).toBeNull()
  })

  it('handles negative-origin rects (a display positioned above/left of the primary)', () => {
    const result = rectIntersection({ x: 50, y: -50, width: 300, height: 100 }, { x: 0, y: -1080, width: 1920, height: 1080 })
    expect(result).toEqual({ x: 50, y: -50, width: 300, height: 50 })
  })

  it('returns a rect fully contained within the other unchanged', () => {
    const result = rectIntersection({ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 0, width: 100, height: 100 })
    expect(result).toEqual({ x: 10, y: 10, width: 20, height: 20 })
  })
})
