// Pure logic for Universal Text Capture's word-level hit-testing (BUILD-SPEC.md
// §4.9, PHASES.md Phase 8.4's "custom hit-testing" decision — chosen over true
// invisible-DOM text selection because real font metrics aren't recoverable
// from Vision's output, so a real DOM selection couldn't be trusted to land on
// the right characters). No DOM/Electron dependency — safe to unit test and to
// import from the overlay renderer.

import { rectIntersection } from './selectionMath'
import type { RectInPoints, TextCaptureLine } from './types'

export interface FlatWord {
  lineIndex: number
  wordIndex: number
  text: string
  rectInPoints: RectInPoints
}

/** Flattens the recognized lines into a single reading-order list, tagging each word with its position for later re-sorting. */
export function flattenWords(lines: TextCaptureLine[]): FlatWord[] {
  const flat: FlatWord[] = []
  lines.forEach((line, lineIndex) => {
    line.words.forEach((word, wordIndex) => {
      flat.push({ lineIndex, wordIndex, text: word.text, rectInPoints: word.rectInPoints })
    })
  })
  return flat
}

function pointInRect(point: { x: number; y: number }, rect: RectInPoints): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

/**
 * Which word a single click (not a drag) landed on — at most one, but
 * returned as an array for a uniform call site with `wordsIntersectingRect`.
 * Deliberately separate from that function: `rectIntersection` rejects a
 * zero-size rect against anything (its `right <= x` check is always true
 * when width/height is 0), so a plain click can't reuse the drag path.
 */
export function wordAtPoint(words: FlatWord[], point: { x: number; y: number }): FlatWord[] {
  const hit = words.find((word) => pointInRect(point, word.rectInPoints))
  return hit ? [hit] : []
}

/** Which words a drag rectangle overlaps, in no particular order — callers needing reading order should sort via `joinSelectedWords`. */
export function wordsIntersectingRect(words: FlatWord[], dragRectInPoints: RectInPoints): FlatWord[] {
  return words.filter((word) => rectIntersection(word.rectInPoints, dragRectInPoints) !== null)
}

/**
 * Joins a set of selected words into copyable text: a space between words on
 * the same line, a newline between lines. Input order doesn't matter — always
 * re-sorted into reading order (line, then word) first, so a right-to-left or
 * bottom-to-top drag still produces correctly-ordered text.
 */
export function joinSelectedWords(selected: FlatWord[]): string {
  if (selected.length === 0) return ''
  const sorted = [...selected].sort((a, b) => a.lineIndex - b.lineIndex || a.wordIndex - b.wordIndex)
  let result = ''
  let lastLineIndex: number | null = null
  for (const word of sorted) {
    if (lastLineIndex === null) result = word.text
    else if (word.lineIndex === lastLineIndex) result += ` ${word.text}`
    else result += `\n${word.text}`
    lastLineIndex = word.lineIndex
  }
  return result
}
