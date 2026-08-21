import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findOverlapPixels, loadRawImage, stitchScrollFrames, type RawImage } from '../../src/main/capture/scrollStitcher'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'scroll-stitcher-test-'))
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

const WIDTH = 40

/** Every row gets a distinct, decodable color (r/g encode the row index) — lets a test assert exactly which source row ended up where in the stitched output, not just "some plausible-looking image". */
function rowColor(row: number): { r: number; g: number; b: number } {
  return { r: row % 256, g: Math.floor(row / 256) % 256, b: 120 }
}

async function makeTallFixture(height: number): Promise<{ path: string; raw: RawImage }> {
  const rowBuffers: Buffer[] = []
  for (let row = 0; row < height; row++) {
    const { r, g, b } = rowColor(row)
    rowBuffers.push(Buffer.from(Array.from({ length: WIDTH }, () => [r, g, b]).flat()))
  }
  const raw = Buffer.concat(rowBuffers)
  const path = join(workDir, 'source.png')
  await sharp(raw, { raw: { width: WIDTH, height, channels: 3 } }).png().toFile(path)
  return { path, raw: await loadRawImage(path) }
}

/** Slices [sliceStart, sliceStart + sliceHeight) out of a fixture — mirrors a real capture of the same fixed rect at successive scroll positions. */
async function sliceFrame(sourcePath: string, sliceStart: number, sliceHeight: number, outPath: string): Promise<void> {
  await sharp(sourcePath).extract({ left: 0, top: sliceStart, width: WIDTH, height: sliceHeight }).png().toFile(outPath)
}

describe('findOverlapPixels', () => {
  it('finds the exact known overlap between two slices of the same fixture', async () => {
    const { path } = await makeTallFixture(400)
    const framePathA = join(workDir, 'a.png')
    const framePathB = join(workDir, 'b.png')
    // Frame A: rows [0, 200). Frame B: rows [120, 320) — should overlap by 80 rows (200 - 120).
    await sliceFrame(path, 0, 200, framePathA)
    await sliceFrame(path, 120, 200, framePathB)

    const a = await loadRawImage(framePathA)
    const b = await loadRawImage(framePathB)
    expect(findOverlapPixels(a, b)).toBe(80)
  })

  it('returns null for two frames with no real overlap (unrelated content)', async () => {
    const { path: fixtureA } = await makeTallFixture(200)
    // A second fixture whose rows are colored differently, so no row of B
    // should plausibly match any strip of A within MATCH_THRESHOLD.
    const rowBuffers: Buffer[] = []
    for (let row = 0; row < 200; row++) {
      rowBuffers.push(Buffer.from(Array.from({ length: WIDTH }, () => [255 - (row % 256), 200, 30]).flat()))
    }
    const fixtureBPath = join(workDir, 'unrelated.png')
    await sharp(Buffer.concat(rowBuffers), { raw: { width: WIDTH, height: 200, channels: 3 } }).png().toFile(fixtureBPath)

    const a = await loadRawImage(fixtureA)
    const b = await loadRawImage(fixtureBPath)
    expect(findOverlapPixels(a, b)).toBeNull()
  })
})

describe('stitchScrollFrames', () => {
  it('reconstructs a tall known image from overlapping frames sliced at known offsets', async () => {
    const height = 600
    const { path: sourcePath } = await makeTallFixture(height)

    // Mirrors a real scroll-capture sequence: fixed-height viewport,
    // successive frames starting further down, each overlapping the last.
    const frameStarts = [0, 120, 240, 360, 400] // final frame's tail reaches the bottom
    const frameHeight = 200
    const framePaths = await Promise.all(
      frameStarts.map(async (start, i) => {
        const clampedHeight = Math.min(frameHeight, height - start)
        const framePath = join(workDir, `frame-${i}.png`)
        await sliceFrame(sourcePath, start, clampedHeight, framePath)
        return framePath
      })
    )

    const outputPath = join(workDir, 'stitched.png')
    await stitchScrollFrames({ framePaths, outputPath })

    const stitched = await loadRawImage(outputPath)
    expect(stitched.height).toBe(height)
    expect(stitched.width).toBe(WIDTH)

    // Spot-check several rows across the reconstructed image decode back to
    // the exact source row they should be — proves no misalignment,
    // duplication, or dropped content at the seams.
    const pixelAt = (raw: RawImage, x: number, y: number): { r: number; g: number; b: number } => {
      const offset = (y * raw.width + x) * 4
      return { r: raw.data.readUInt8(offset), g: raw.data.readUInt8(offset + 1), b: raw.data.readUInt8(offset + 2) }
    }
    for (const row of [0, 50, 119, 120, 250, 359, 360, 480, 599]) {
      expect(pixelAt(stitched, 5, row)).toEqual(rowColor(row))
    }
  })

  it('falls back to appending the whole frame when frames do not overlap, rather than dropping content', async () => {
    const height = 100
    const { path: sourcePath } = await makeTallFixture(height)
    const framePathA = join(workDir, 'a.png')
    const framePathB = join(workDir, 'b.png')
    await sliceFrame(sourcePath, 0, height, framePathA)
    await sliceFrame(sourcePath, 0, height, framePathB) // identical content, not a real "next" frame, but proves no-overlap path keeps all rows

    // Force a genuinely non-overlapping pair by using the "unrelated colors"
    // fixture from the findOverlapPixels test as the second frame.
    const rowBuffers: Buffer[] = []
    for (let row = 0; row < height; row++) {
      rowBuffers.push(Buffer.from(Array.from({ length: WIDTH }, () => [10, 20, 30]).flat()))
    }
    await sharp(Buffer.concat(rowBuffers), { raw: { width: WIDTH, height, channels: 3 } }).png().toFile(framePathB)

    const outputPath = join(workDir, 'stitched.png')
    await stitchScrollFrames({ framePaths: [framePathA, framePathB], outputPath })

    const stitched = await loadRawImage(outputPath)
    // No confident overlap found -> whole second frame appended -> total
    // height is the sum of both, not deduplicated.
    expect(stitched.height).toBe(height * 2)
  })
})
