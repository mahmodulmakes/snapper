import { describe, expect, it } from 'vitest'
import { buildScreenshotFilename } from '../../src/main/output/fileWriter'

describe('buildScreenshotFilename', () => {
  it('formats as "Screenshot {date} at {time}.png" with no colons', () => {
    const date = new Date(2026, 7, 21, 3, 5, 9) // Aug 21 2026, 03:05:09
    expect(buildScreenshotFilename(date)).toBe('Screenshot 2026-08-21 at 03.05.09.png')
  })

  it('pads single-digit month/day/hour/minute/second', () => {
    const date = new Date(2026, 0, 2, 1, 2, 3) // Jan 2 2026, 01:02:03
    expect(buildScreenshotFilename(date)).toBe('Screenshot 2026-01-02 at 01.02.03.png')
  })
})
