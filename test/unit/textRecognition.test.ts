import { describe, expect, it } from 'vitest'
import { parseHelperOutput, TextRecognitionError } from '../../src/main/capture/textRecognition'

const sampleStdout = JSON.stringify({
  lines: [
    {
      text: 'Hello World',
      confidence: 1,
      boundingBox: { x: 0.08, y: 0.71, width: 0.35, height: 0.13 },
      words: [
        { text: 'Hello', boundingBox: { x: 0.08, y: 0.71, width: 0.16, height: 0.13 } },
        { text: 'World', boundingBox: { x: 0.25, y: 0.71, width: 0.18, height: 0.13 } }
      ]
    }
  ],
  recognitionMs: 200,
  imageWidth: 1000,
  imageHeight: 440
})

describe('parseHelperOutput', () => {
  it('parses lines, words, and image dimensions from the helper JSON', () => {
    const result = parseHelperOutput(sampleStdout)
    expect(result.imageWidthPixels).toBe(1000)
    expect(result.imageHeightPixels).toBe(440)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe('Hello World')
    expect(result.lines[0].confidence).toBe(1)
    expect(result.lines[0].boundingBoxNormalized).toEqual({ x: 0.08, y: 0.71, width: 0.35, height: 0.13 })
    expect(result.lines[0].words).toHaveLength(2)
    expect(result.lines[0].words[1]).toEqual({
      text: 'World',
      boundingBoxNormalized: { x: 0.25, y: 0.71, width: 0.18, height: 0.13 }
    })
  })

  it('handles a result with no recognized text', () => {
    const result = parseHelperOutput(JSON.stringify({ lines: [], recognitionMs: 50, imageWidth: 200, imageHeight: 100 }))
    expect(result.lines).toEqual([])
  })

  it('throws TextRecognitionError on malformed JSON', () => {
    expect(() => parseHelperOutput('not json')).toThrow(TextRecognitionError)
  })

  it('throws TextRecognitionError when the "lines" field is missing', () => {
    expect(() => parseHelperOutput(JSON.stringify({ recognitionMs: 50 }))).toThrow(TextRecognitionError)
  })
})
