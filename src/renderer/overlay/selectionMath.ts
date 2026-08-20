export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DragModifiers {
  square: boolean // Shift
  fromCenter: boolean // Option
}

/**
 * Computes a drag rectangle from an anchor point to the current pointer
 * position. `fromCenter` treats the anchor as the rect's center instead of a
 * corner (BUILD-SPEC.md §4.2: Option = resize from centre).
 */
export function computeDragRect(anchor: Point, current: Point, modifiers: DragModifiers): Rect {
  if (modifiers.fromCenter) {
    let dx = Math.abs(current.x - anchor.x)
    let dy = Math.abs(current.y - anchor.y)
    if (modifiers.square) {
      const d = Math.max(dx, dy)
      dx = d
      dy = d
    }
    return { x: anchor.x - dx, y: anchor.y - dy, width: dx * 2, height: dy * 2 }
  }

  let dx = current.x - anchor.x
  let dy = current.y - anchor.y
  if (modifiers.square) {
    const d = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * d
    dy = Math.sign(dy || 1) * d
  }
  return {
    x: Math.min(anchor.x, anchor.x + dx),
    y: Math.min(anchor.y, anchor.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy)
  }
}

/** Translates a rect by how far the pointer has moved since `anchor` (Space = move the existing selection). */
export function translateRect(base: Rect, anchor: Point, current: Point): Rect {
  return {
    x: base.x + (current.x - anchor.x),
    y: base.y + (current.y - anchor.y),
    width: base.width,
    height: base.height
  }
}

/** Arrow-key nudge: 1px, or 10px with Shift (BUILD-SPEC.md §4.2). */
export function nudgeRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

/** Keeps a rect within [0, bounds.width] x [0, bounds.height]. */
export function clampRectToBounds(rect: Rect, bounds: { width: number; height: number }): Rect {
  const width = Math.min(rect.width, bounds.width)
  const height = Math.min(rect.height, bounds.height)
  const x = Math.min(Math.max(rect.x, 0), bounds.width - width)
  const y = Math.min(Math.max(rect.y, 0), bounds.height - height)
  return { x, y, width, height }
}
