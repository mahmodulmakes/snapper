import { describe, expect, it } from 'vitest'
import { buildRegionSpec } from '../../src/main/capture/screencapture'

describe('buildRegionSpec', () => {
  it('joins x,y,width,height for the -R flag', () => {
    expect(buildRegionSpec({ x: 10, y: 20, width: 300, height: 200 })).toBe('10,20,300,200')
  })

  it('rounds fractional coordinates', () => {
    expect(buildRegionSpec({ x: 10.4, y: 20.6, width: 300.5, height: 199.5 })).toBe('10,21,301,200')
  })

  it('handles negative origins (display left of / above primary)', () => {
    expect(buildRegionSpec({ x: -1200, y: -50, width: 300, height: 200 })).toBe('-1200,-50,300,200')
  })
})
