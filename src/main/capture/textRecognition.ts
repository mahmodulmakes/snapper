import { app } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { NormalizedBoxBottomLeft, TextRecognitionResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

export class TextRecognitionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'TextRecognitionError'
  }
}

/**
 * Locates the compiled Vision helper (native/textRecognizer/main.swift,
 * built by scripts/buildTextRecognizer.mjs). Packaged builds ship it via
 * electron-builder's `extraResources` at `Resources/bin/`; dev mode reads it
 * straight from the project's own resources/ directory.
 */
function helperBinaryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', 'text-recognizer')
    : join(app.getAppPath(), 'resources', 'bin', 'text-recognizer')
}

interface HelperWordOutput {
  text: string
  boundingBox: NormalizedBoxBottomLeft
}

interface HelperLineOutput {
  text: string
  confidence: number
  boundingBox: NormalizedBoxBottomLeft
  words: HelperWordOutput[]
}

interface HelperOutput {
  lines: HelperLineOutput[]
  recognitionMs: number
  imageWidth: number
  imageHeight: number
}

/**
 * Parses the helper's stdout JSON into the app's typed result. Pulled out of
 * `recognizeText` so it's unit-testable without mocking the child_process
 * boundary (test/unit/textRecognition.test.ts) — matches how
 * screencapture.ts's `buildRegionSpec` is tested separately from the actual
 * `captureRegion` shell-out.
 */
export function parseHelperOutput(stdout: string): TextRecognitionResult {
  let parsed: HelperOutput
  try {
    parsed = JSON.parse(stdout) as HelperOutput
  } catch (err) {
    throw new TextRecognitionError('text-recognizer helper returned invalid JSON', err)
  }

  if (!Array.isArray(parsed.lines)) {
    throw new TextRecognitionError('text-recognizer helper returned an unexpected shape (missing "lines" array)')
  }

  return {
    lines: parsed.lines.map((line) => ({
      text: line.text,
      confidence: line.confidence,
      boundingBoxNormalized: line.boundingBox,
      words: line.words.map((word) => ({
        text: word.text,
        boundingBoxNormalized: word.boundingBox
      }))
    })),
    imageWidthPixels: parsed.imageWidth,
    imageHeightPixels: parsed.imageHeight
  }
}

/**
 * Runs the on-device Vision text-recognition helper against a PNG file.
 * Returns Vision's raw normalized, bottom-left-origin boxes, unconverted —
 * callers use displayManager.ts's `visionBoxToGlobalPoints` to map them onto
 * the screen (CLAUDE.md Hard Rule 3).
 */
export async function recognizeText(imagePath: string): Promise<TextRecognitionResult> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(helperBinaryPath(), [imagePath]))
  } catch (err) {
    throw new TextRecognitionError('text-recognizer helper failed to run', err)
  }
  return parseHelperOutput(stdout)
}
