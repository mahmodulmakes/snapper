import sharp from 'sharp'

export interface CaptureSegmentFile {
  pngPath: string
  destXPixels: number
  destYPixels: number
  resizeToPixels: { width: number; height: number }
}

export interface StitchOptions {
  segments: CaptureSegmentFile[]
  outputPath: string
  compositeSizeInPixels: { width: number; height: number }
}

/**
 * Composites native-resolution per-display capture segments into one image.
 * A segment from a lower-scaleFactor display is upscaled to the composite's
 * target size — never the other way around, so the highest-DPI segment
 * present keeps its full native detail (see displayManager.ts's
 * `planCapture` doc comment and spikes/FINDINGS.md spike 4).
 */
export async function stitchSegments({ segments, outputPath, compositeSizeInPixels }: StitchOptions): Promise<void> {
  const composites = await Promise.all(
    segments.map(async (segment) => {
      const buffer = await sharp(segment.pngPath)
        .resize(segment.resizeToPixels.width, segment.resizeToPixels.height, { kernel: 'lanczos3' })
        .toBuffer()
      return { input: buffer, left: segment.destXPixels, top: segment.destYPixels }
    })
  )

  await sharp({
    create: {
      width: compositeSizeInPixels.width,
      height: compositeSizeInPixels.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}
