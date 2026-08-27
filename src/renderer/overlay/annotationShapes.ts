import type { AnnotationShape } from '../../shared/types'

const ARROWHEAD_LENGTH_PX = 18
const ARROWHEAD_ANGLE_RAD = Math.PI / 7
const LINE_WIDTH_PX = 3

function drawArrow(ctx: CanvasRenderingContext2D, { x0, y0, x1, y1 }: AnnotationShape): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()

  const angle = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(
    x1 - ARROWHEAD_LENGTH_PX * Math.cos(angle - ARROWHEAD_ANGLE_RAD),
    y1 - ARROWHEAD_LENGTH_PX * Math.sin(angle - ARROWHEAD_ANGLE_RAD)
  )
  ctx.moveTo(x1, y1)
  ctx.lineTo(
    x1 - ARROWHEAD_LENGTH_PX * Math.cos(angle + ARROWHEAD_ANGLE_RAD),
    y1 - ARROWHEAD_LENGTH_PX * Math.sin(angle + ARROWHEAD_ANGLE_RAD)
  )
  ctx.stroke()
}

function drawRectangle(ctx: CanvasRenderingContext2D, { x0, y0, x1, y1 }: AnnotationShape): void {
  ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
}

function drawOval(ctx: CanvasRenderingContext2D, { x0, y0, x1, y1 }: AnnotationShape): void {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.abs(x1 - x0) / 2
  const ry = Math.abs(y1 - y0) / 2
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
}

function drawLine(ctx: CanvasRenderingContext2D, { x0, y0, x1, y1 }: AnnotationShape): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

/**
 * Draws one shape onto the overlay canvas, in the SAME point-space as the
 * selection rect it's drawn over. This is a live preview only — the final
 * output is rasterized server-side onto the real captured pixels
 * (`main/output/annotationOverlay.ts`), at that image's own resolution, once
 * Copy/Save fires. `LINE_WIDTH_PX` here is a point-space preview width and
 * is unrelated to the pixel-space stroke width the server-side compositor
 * picks for the final PNG.
 */
export function drawAnnotationShape(ctx: CanvasRenderingContext2D, shape: AnnotationShape): void {
  ctx.strokeStyle = shape.color
  ctx.lineWidth = LINE_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (shape.tool) {
    case 'arrow':
      drawArrow(ctx, shape)
      return
    case 'rectangle':
      drawRectangle(ctx, shape)
      return
    case 'oval':
      drawOval(ctx, shape)
      return
    case 'line':
      drawLine(ctx, shape)
      return
  }
}

/** Below this drag distance, treat it as an accidental click rather than a shape. */
export function isDegenerateShape(shape: AnnotationShape): boolean {
  return Math.hypot(shape.x1 - shape.x0, shape.y1 - shape.y0) < 3
}
