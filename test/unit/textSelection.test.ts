import { describe, expect, it } from 'vitest'
import { flattenWords, joinSelectedWords, wordAtPoint, wordsIntersectingRect } from '../../src/shared/textSelection'
import type { TextCaptureLine } from '../../src/shared/types'

const lines: TextCaptureLine[] = [
  {
    text: 'The quick brown',
    rectInPoints: { x: 0, y: 0, width: 300, height: 20 },
    words: [
      { text: 'The', rectInPoints: { x: 0, y: 0, width: 90, height: 20 } },
      { text: 'quick', rectInPoints: { x: 100, y: 0, width: 90, height: 20 } },
      { text: 'brown', rectInPoints: { x: 200, y: 0, width: 90, height: 20 } }
    ]
  },
  {
    text: 'fox jumps',
    rectInPoints: { x: 0, y: 30, width: 200, height: 20 },
    words: [
      { text: 'fox', rectInPoints: { x: 0, y: 30, width: 90, height: 20 } },
      { text: 'jumps', rectInPoints: { x: 100, y: 30, width: 90, height: 20 } }
    ]
  }
]

describe('flattenWords', () => {
  it('flattens every line into reading order with line/word indices', () => {
    const flat = flattenWords(lines)
    expect(flat).toHaveLength(5)
    expect(flat.map((w) => w.text)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps'])
    expect(flat[3]).toMatchObject({ lineIndex: 1, wordIndex: 0, text: 'fox' })
  })
})

describe('wordAtPoint', () => {
  const flat = flattenWords(lines)

  it('returns the single word a point lands inside', () => {
    expect(wordAtPoint(flat, { x: 120, y: 10 }).map((w) => w.text)).toEqual(['quick'])
  })

  it('returns nothing for a point in the gap between words', () => {
    expect(wordAtPoint(flat, { x: 95, y: 10 })).toEqual([])
  })

  it('returns nothing for a point far outside any word', () => {
    expect(wordAtPoint(flat, { x: 9999, y: 9999 })).toEqual([])
  })
})

describe('wordsIntersectingRect', () => {
  const flat = flattenWords(lines)

  it('returns every word a drag rectangle overlaps, across multiple lines', () => {
    // x:[100,190] spans both rows but only touches the second word on each
    // ("quick" on row 1, "jumps" on row 2) — "The"/"brown"/"fox" all sit
    // outside that x-band.
    const selected = wordsIntersectingRect(flat, { x: 100, y: 0, width: 90, height: 50 })
    expect(selected.map((w) => w.text).sort()).toEqual(['jumps', 'quick'].sort())
  })

  it('returns an empty array when the rect touches nothing', () => {
    expect(wordsIntersectingRect(flat, { x: 1000, y: 1000, width: 10, height: 10 })).toEqual([])
  })

  it('a full-region drag selects every word', () => {
    const selected = wordsIntersectingRect(flat, { x: 0, y: 0, width: 300, height: 60 })
    expect(selected).toHaveLength(5)
  })
})

describe('joinSelectedWords', () => {
  const flat = flattenWords(lines)

  it('joins words on the same line with spaces', () => {
    const selected = wordAtPoint(flat, { x: 10, y: 10 }).concat(wordsIntersectingRect(flat, { x: 100, y: 0, width: 90, height: 20 }))
    expect(joinSelectedWords(selected)).toBe('The quick')
  })

  it('joins words across lines with a newline, regardless of input order', () => {
    const [theWord, , , foxWord] = flat
    // Deliberately out of reading order — the function must re-sort.
    expect(joinSelectedWords([foxWord!, theWord!])).toBe('The\nfox')
  })

  it('returns an empty string for no selection', () => {
    expect(joinSelectedWords([])).toBe('')
  })

  it('reconstructs a full multi-line selection in correct reading order', () => {
    expect(joinSelectedWords(flat)).toBe('The quick brown\nfox jumps')
  })
})
