import { describe, expect, it } from 'vitest'
import { overlayLocalRectToGlobalPoints } from '../../src/main/capture/displayManager'

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
})
