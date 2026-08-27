// Universal Text Capture's word-level selection UI (BUILD-SPEC.md §4.9).
// Vanilla TS, no React — the overlay renderer's architecture rule applies
// here too. All the actual hit-testing/ordering logic is pure and lives in
// shared/textSelection.ts (unit tested there); this module is just the thin
// stateful/drawing layer around it.

import { flattenWords, joinSelectedWords, wordAtPoint, wordsIntersectingRect, type FlatWord } from '../../shared/textSelection'
import type { RectInPoints, TextCaptureResultPayload } from '../../shared/types'

let words: FlatWord[] = []
let containerRectInPoints: RectInPoints | null = null
let selectedWords: FlatWord[] = []
let dragAnchor: { x: number; y: number } | null = null

// A plain click has zero drag distance in principle, but a human hand never
// lands pixel-perfect — a few points of jitter between mousedown and mouseup
// shouldn't be treated as an intentional drag-select.
const CLICK_VS_DRAG_THRESHOLD_POINTS = 3

export function isActive(): boolean {
  return words.length > 0
}

export function setResult(payload: TextCaptureResultPayload, regionInPoints: RectInPoints): void {
  words = flattenWords(payload.lines)
  containerRectInPoints = regionInPoints
  selectedWords = []
  dragAnchor = null
}

export function clear(): void {
  words = []
  containerRectInPoints = null
  selectedWords = []
  dragAnchor = null
}

export function containsPoint(x: number, y: number): boolean {
  if (!containerRectInPoints) return false
  const r = containerRectInPoints
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

export function startSelectionDrag(x: number, y: number): void {
  dragAnchor = { x, y }
  selectedWords = wordAtPoint(words, { x, y })
}

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): RectInPoints {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

export function updateSelectionDrag(x: number, y: number): void {
  if (!dragAnchor) return
  const dx = Math.abs(x - dragAnchor.x)
  const dy = Math.abs(y - dragAnchor.y)
  if (dx <= CLICK_VS_DRAG_THRESHOLD_POINTS && dy <= CLICK_VS_DRAG_THRESHOLD_POINTS) {
    selectedWords = wordAtPoint(words, dragAnchor)
    return
  }
  selectedWords = wordsIntersectingRect(words, rectFromPoints(dragAnchor, { x, y }))
}

export function endSelectionDrag(): void {
  dragAnchor = null
}

export function selectAll(): void {
  selectedWords = [...words]
}

export function hasSelection(): boolean {
  return selectedWords.length > 0
}

export function getSelectedText(): string {
  return joinSelectedWords(selectedWords)
}

/** Draws highlight boxes for the currently-selected words. Call from the overlay's own render() with its 2D context, in local CSS-point space (the same space `render()` already draws in). */
export function drawHighlights(ctx: CanvasRenderingContext2D): void {
  if (selectedWords.length === 0) return
  ctx.fillStyle = 'rgba(59, 130, 246, 0.35)'
  for (const word of selectedWords) {
    ctx.fillRect(word.rectInPoints.x, word.rectInPoints.y, word.rectInPoints.width, word.rectInPoints.height)
  }
}
