import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stitchSegments } from '../../src/main/capture/stitcher'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'stitcher-test-'))
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

async function solidColorPng(path: string, width: number, height: number, rgb: { r: number; g: number; b: number }): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: rgb } }).png().toFile(path)
}

describe('stitchSegments', () => {
  it('composites two native-resolution segments (mirrors spike 4: a 1x segment upscaled to sit beside a 2x segment)', async () => {
    // Mirrors the real geometry from displayManager.test.ts's planCapture
    // spike-4 test: a 300x50pt external (1x) segment stacked above a
    // 300x50pt Retina (2x) segment, composited at the 2x target scale.
    const externalPath = join(workDir, 'external.png')
    const retinaPath = join(workDir, 'retina.png')
    await solidColorPng(externalPath, 300, 50, { r: 255, g: 0, b: 0 }) // native 1x capture
    await solidColorPng(retinaPath, 600, 100, { r: 0, g: 0, b: 255 }) // native 2x capture
    const outputPath = join(workDir, 'composite.png')

    await stitchSegments({
      segments: [
        { pngPath: externalPath, destXPixels: 0, destYPixels: 0, resizeToPixels: { width: 600, height: 100 } },
        { pngPath: retinaPath, destXPixels: 0, destYPixels: 100, resizeToPixels: { width: 600, height: 100 } }
      ],
      outputPath,
      compositeSizeInPixels: { width: 600, height: 200 }
    })

    const meta = await sharp(outputPath).metadata()
    expect(meta.width).toBe(600)
    expect(meta.height).toBe(200)

    const raw = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixelAt = (x: number, y: number): { r: number; g: number; b: number } => {
      const offset = (y * raw.info.width + x) * raw.info.channels
      return { r: raw.data[offset] ?? -1, g: raw.data[offset + 1] ?? -1, b: raw.data[offset + 2] ?? -1 }
    }

    // Upscaled external segment (was red at 1x) fills the top half.
    expect(pixelAt(300, 50)).toEqual({ r: 255, g: 0, b: 0 })
    // Native retina segment (blue) fills the bottom half, placed at its own destYPixels.
    expect(pixelAt(300, 150)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('places a single segment at a non-zero offset within a larger composite, leaving the rest transparent', async () => {
    const segmentPath = join(workDir, 'segment.png')
    await solidColorPng(segmentPath, 50, 50, { r: 0, g: 255, b: 0 })
    const outputPath = join(workDir, 'composite.png')

    await stitchSegments({
      segments: [{ pngPath: segmentPath, destXPixels: 20, destYPixels: 10, resizeToPixels: { width: 50, height: 50 } }],
      outputPath,
      compositeSizeInPixels: { width: 100, height: 100 }
    })

    const raw = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixelAt = (x: number, y: number): { r: number; g: number; b: number; a: number } => {
      const offset = (y * raw.info.width + x) * raw.info.channels
      return { r: raw.data[offset] ?? -1, g: raw.data[offset + 1] ?? -1, b: raw.data[offset + 2] ?? -1, a: raw.data[offset + 3] ?? -1 }
    }

    expect(pixelAt(45, 35)).toEqual({ r: 0, g: 255, b: 0, a: 255 }) // inside the placed segment
    expect(pixelAt(5, 5).a).toBe(0) // outside it — untouched, transparent background
  })
})
