import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import type { AnnotationShapePixels } from '../../shared/types'

export class AnnotationCompositeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'AnnotationCompositeError'
  }
}

// Shapes only ever come from a fixed internal palette or the native
// `<input type="color">` (always #rrggbb/#rgb), never raw user text — but
// this becomes literal SVG markup, so it's validated defensively anyway.
function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#ff0000'
}

const ARROWHEAD_ANGLE_RAD = Math.PI / 7

function shapeToSvgElement(shape: AnnotationShapePixels): string {
  const color = safeColor(shape.color)
  const w = shape.lineWidthInPixels
  switch (shape.tool) {
    case 'line':
      return `<line x1="${shape.x0}" y1="${shape.y0}" x2="${shape.x1}" y2="${shape.y1}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" />`
    case 'rectangle': {
      const x = Math.min(shape.x0, shape.x1)
      const y = Math.min(shape.y0, shape.y1)
      const width = Math.abs(shape.x1 - shape.x0)
      const height = Math.abs(shape.y1 - shape.y0)
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" stroke="${color}" stroke-width="${w}" fill="none" />`
    }
    case 'oval': {
      const cx = (shape.x0 + shape.x1) / 2
      const cy = (shape.y0 + shape.y1) / 2
      const rx = Math.abs(shape.x1 - shape.x0) / 2
      const ry = Math.abs(shape.y1 - shape.y0) / 2
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${color}" stroke-width="${w}" fill="none" />`
    }
    case 'arrow': {
      const angle = Math.atan2(shape.y1 - shape.y0, shape.x1 - shape.x0)
      const headLength = Math.max(14, w * 4)
      const hx1 = shape.x1 - headLength * Math.cos(angle - ARROWHEAD_ANGLE_RAD)
      const hy1 = shape.y1 - headLength * Math.sin(angle - ARROWHEAD_ANGLE_RAD)
      const hx2 = shape.x1 - headLength * Math.cos(angle + ARROWHEAD_ANGLE_RAD)
      const hy2 = shape.y1 - headLength * Math.sin(angle + ARROWHEAD_ANGLE_RAD)
      return [
        `<line x1="${shape.x0}" y1="${shape.y0}" x2="${shape.x1}" y2="${shape.y1}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" />`,
        `<line x1="${shape.x1}" y1="${shape.y1}" x2="${hx1}" y2="${hy1}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" />`,
        `<line x1="${shape.x1}" y1="${shape.y1}" x2="${hx2}" y2="${hy2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" />`
      ].join('')
    }
  }
}

/**
 * Rasterizes drawn shapes onto a captured PNG (BUILD-SPEC.md §2.4.2/§4.5a),
 * overwriting `pngPath` in place. A no-op if there are no shapes — the
 * common case, since annotation is optional on every capture.
 *
 * Reads the whole flattened result into memory via `toBuffer()` before
 * writing it back over `pngPath`, rather than piping sharp's output
 * directly to the same path it's reading from (unsafe — sharp streams the
 * read lazily, so a same-path write could race its own input).
 */
export async function compositeAnnotations(
  pngPath: string,
  shapes: AnnotationShapePixels[],
  imageWidthPixels: number,
  imageHeightPixels: number
): Promise<void> {
  if (shapes.length === 0) return

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidthPixels}" height="${imageHeightPixels}">${shapes
    .map(shapeToSvgElement)
    .join('')}</svg>`

  try {
    const flattened = await sharp(pngPath)
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer()
    await writeFile(pngPath, flattened)
  } catch (err) {
    throw new AnnotationCompositeError('Could not draw annotations onto the captured image', err)
  }
}
