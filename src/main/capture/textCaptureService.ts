import { rm } from 'node:fs/promises'
import { visionBoxToGlobalPoints } from './displayManager'
import { captureToTemp } from './captureService'
import { recognizeText, TextRecognitionError } from './textRecognition'
import { notifyFailure as notifyFailureBase } from '../notify'
import type { RectInPoints } from '../../shared/types'

function notifyFailure(message: string): void {
  notifyFailureBase('Text capture failed', message)
}

export interface TextCaptureWordResult {
  text: string
  rectInPoints: RectInPoints
}

export interface TextCaptureLineResult {
  text: string
  confidence: number
  rectInPoints: RectInPoints
  words: TextCaptureWordResult[]
}

export interface TextCaptureResult {
  lines: TextCaptureLineResult[]
}

/**
 * Orchestrates one text capture end-to-end (BUILD-SPEC.md §4.9): capture the
 * region -> recognize text on-device via Vision -> convert every box to
 * GLOBAL Electron points. Reuses `captureToTemp` from captureService.ts
 * rather than re-implementing the cross-display capture/stitch logic — the
 * composite image it produces always spans exactly `rectInPoints`
 * regardless of how many displays or scaleFactors were involved, which is
 * exactly what `visionBoxToGlobalPoints` needs.
 *
 * Returns GLOBAL points, not any one overlay window's local points — the
 * caller (overlayManager.ts, Phase 8.4) is responsible for translating into
 * each recipient window's local coordinates before broadcasting, the same
 * way `OverlaySelectionStatePayload` already works for region selection.
 */
export async function captureTextInRegion(rectInPoints: RectInPoints): Promise<TextCaptureResult | null> {
  const captured = await captureToTemp(rectInPoints)
  if (!captured) return null

  try {
    const recognition = await recognizeText(captured.tempPath)

    if (recognition.lines.length === 0) {
      notifyFailure('No text found in the selected region.')
      return null
    }

    return {
      lines: recognition.lines.map((line) => ({
        text: line.text,
        confidence: line.confidence,
        rectInPoints: visionBoxToGlobalPoints(line.boundingBoxNormalized, rectInPoints),
        words: line.words.map((word) => ({
          text: word.text,
          rectInPoints: visionBoxToGlobalPoints(word.boundingBoxNormalized, rectInPoints)
        }))
      }))
    }
  } catch (err) {
    const message = err instanceof TextRecognitionError ? err.message : 'Text recognition failed unexpectedly'
    notifyFailure(message)
    return null
  } finally {
    await rm(captured.tempDir, { recursive: true, force: true })
  }
}
