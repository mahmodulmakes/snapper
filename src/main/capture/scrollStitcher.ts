import sharp from 'sharp'

export interface RawImage {
  data: Buffer // RGBA, row-major
  width: number
  height: number
}

const STRIP_HEIGHT_PIXELS = 32
const COLUMN_SAMPLE_STRIDE = 4 // sample every 4th column — a strip match doesn't need every pixel to be reliable, and it keeps this fast enough to run between scroll ticks
const MATCH_THRESHOLD = 12 // average per-channel abs diff (0-255 scale) below this counts as a real match; empirical, not derived

export async function loadRawImage(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function rowStripAverageDiff(a: RawImage, aRowStart: number, b: RawImage, bRowStart: number, stripHeight: number): number {
  const width = Math.min(a.width, b.width)
  let total = 0
  let count = 0
  for (let row = 0; row < stripHeight; row++) {
    const aRow = aRowStart + row
    const bRow = bRowStart + row
    if (aRow < 0 || aRow >= a.height || bRow < 0 || bRow >= b.height) continue
    for (let col = 0; col < width; col += COLUMN_SAMPLE_STRIDE) {
      const aIdx = (aRow * a.width + col) * 4
      const bIdx = (bRow * b.width + col) * 4
      total +=
        Math.abs(a.data.readUInt8(aIdx) - b.data.readUInt8(bIdx)) +
        Math.abs(a.data.readUInt8(aIdx + 1) - b.data.readUInt8(bIdx + 1)) +
        Math.abs(a.data.readUInt8(aIdx + 2) - b.data.readUInt8(bIdx + 2))
      count += 3
    }
  }
  return count === 0 ? Infinity : total / count
}

/**
 * How many rows of `previous`'s BOTTOM overlap with `next`'s TOP: slides a
 * strip of `next`'s top rows down against `previous` and keeps the
 * best-matching offset (lowest average pixel difference) — BUILD-SPEC.md
 * §3.5's "normalized cross-correlation on a horizontal strip of rows".
 * Returns null when nothing matches well enough to call it an overlap
 * (content changed too much between frames to trust any offset) — the
 * caller's job to decide what that means (stop scrolling? append the whole
 * frame anyway?), not this function's.
 */
export function findOverlapPixels(previous: RawImage, next: RawImage): number | null {
  const stripHeight = Math.min(STRIP_HEIGHT_PIXELS, next.height, previous.height)
  let best: { overlap: number; diff: number } | null = null
  for (let overlap = stripHeight; overlap <= previous.height; overlap++) {
    const previousRowStart = previous.height - overlap
    const diff = rowStripAverageDiff(previous, previousRowStart, next, 0, stripHeight)
    if (!best || diff < best.diff) best = { overlap, diff }
  }
  if (!best || best.diff > MATCH_THRESHOLD) return null
  return best.overlap
}

export interface StitchScrollFramesOptions {
  framePaths: string[]
  outputPath: string
}

/**
 * Stitches a sequence of overlapping downward-scroll frames (same fixed
 * capture rect, each one scrolled further than the last) into one tall
 * image, by finding each consecutive pair's overlap and appending only the
 * non-overlapping remainder of each new frame.
 */
export async function stitchScrollFrames({ framePaths, outputPath }: StitchScrollFramesOptions): Promise<void> {
  const [firstPath, ...restPaths] = framePaths
  if (!firstPath) throw new Error('stitchScrollFrames: no frames to stitch')

  const firstFrame = await loadRawImage(firstPath)
  const width = firstFrame.width

  const pieces: { data: Buffer; height: number }[] = [{ data: firstFrame.data, height: firstFrame.height }]
  let previous = firstFrame
  for (const framePath of restPaths) {
    const next = await loadRawImage(framePath)
    const overlap = findOverlapPixels(previous, next)
    // No confident match: append the whole frame rather than silently drop
    // content on a guess — a possible duplicate seam beats losing data.
    const skipRows = overlap ?? 0
    const remainderStart = skipRows * next.width * 4
    pieces.push({ data: next.data.subarray(remainderStart), height: next.height - skipRows })
    previous = next
  }

  const totalHeight = pieces.reduce((sum, piece) => sum + piece.height, 0)
  const combined = Buffer.concat(
    pieces.map((piece) => piece.data),
    width * totalHeight * 4
  )

  await sharp(combined, { raw: { width, height: totalHeight, channels: 4 } }).png().toFile(outputPath)
}
