// Magnifier loupe and window-under-cursor detection are not built yet —
// everything else from BUILD-SPEC.md §4.2's region capture flow lives here.
import {
  clampRectToBounds,
  computeDragRect,
  nudgeRect,
  type Point,
  type Rect
} from './selectionMath'

const canvas = document.getElementById('overlay-canvas')
const ctx = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null

let anchor: Point | null = null
let lastMouse: Point | null = null
let dragging = false
let liveRect: Rect | null = null
let selection: Rect | null = null
const mods = { shift: false, option: false, space: false }

function bounds(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

function resizeCanvas(): void {
  if (!(canvas instanceof HTMLCanvasElement) || !ctx) return
  // devicePixelRatio here is a Canvas API backing-store resolution concern
  // (standard HTML5 HiDPI-crispness technique), not a capture-coordinate
  // conversion — it never touches rect math or the IPC payload, both of
  // which stay in CSS-pixel/point space. Does not fall under CLAUDE.md Hard
  // Rule 3 (that's about the capture pipeline, owned by displayManager.ts).
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}

function drawBadge(rect: Rect): void {
  if (!ctx) return
  const label = `${Math.round(rect.width)} × ${Math.round(rect.height)}`
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
  const paddingX = 6
  const badgeHeight = 20
  const textWidth = ctx.measureText(label).width
  const badgeWidth = textWidth + paddingX * 2

  const badgeX = rect.x
  let badgeY = rect.y - badgeHeight - 4
  if (badgeY < 0) badgeY = rect.y + 4

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight)
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, badgeX + paddingX, badgeY + badgeHeight / 2)
}

function render(): void {
  if (!ctx || !(canvas instanceof HTMLCanvasElement)) return
  // ctx is dpr-scaled (see resizeCanvas) — draw in CSS-point space, not
  // canvas.width/height (that's the larger device-pixel backing store).
  const { width, height } = bounds()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fillRect(0, 0, width, height)

  const rect = liveRect ?? selection
  if (!rect) return

  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, rect.width - 1, rect.height - 1)
  drawBadge(rect)
}

function currentModifiers(): { square: boolean; fromCenter: boolean } {
  return { square: mods.shift, fromCenter: mods.option }
}

function resetSelectionState(): void {
  dragging = false
  anchor = null
  lastMouse = null
  liveRect = null
  selection = null
  render()
}

function onMouseDown(event: MouseEvent): void {
  const point: Point = { x: event.clientX, y: event.clientY }
  anchor = point
  lastMouse = point
  dragging = true
  selection = null
  liveRect = computeDragRect(anchor, point, currentModifiers())
  render()
}

function onMouseMove(event: MouseEvent): void {
  if (!dragging || !anchor || !lastMouse) return
  const point: Point = { x: event.clientX, y: event.clientY }

  // Space = move the existing selection: shift the anchor by the same delta
  // as the pointer, so the anchor-to-pointer vector (and thus the rect's
  // size) stays constant while its position follows the pointer.
  if (mods.space) {
    anchor = { x: anchor.x + (point.x - lastMouse.x), y: anchor.y + (point.y - lastMouse.y) }
  }
  lastMouse = point

  liveRect = clampRectToBounds(computeDragRect(anchor, point, currentModifiers()), bounds())
  render()
}

function onMouseUp(): void {
  if (!dragging) return
  dragging = false
  if (liveRect && liveRect.width >= 2 && liveRect.height >= 2) {
    selection = liveRect
    window.overlayApi.completeSelection(selection)
  }
  liveRect = null
  anchor = null
  lastMouse = null
  render()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    window.overlayApi.dismiss()
    return
  }
  if (event.key === 'Shift') mods.shift = true
  if (event.key === 'Alt') mods.option = true
  if (event.key === ' ') {
    mods.space = true
    event.preventDefault()
  }

  if (selection && !dragging) {
    const step = event.shiftKey ? 10 : 1
    let dx = 0
    let dy = 0
    if (event.key === 'ArrowUp') dy = -step
    else if (event.key === 'ArrowDown') dy = step
    else if (event.key === 'ArrowLeft') dx = -step
    else if (event.key === 'ArrowRight') dx = step

    if (dx !== 0 || dy !== 0) {
      selection = clampRectToBounds(nudgeRect(selection, dx, dy), bounds())
      window.overlayApi.completeSelection(selection)
      render()
      event.preventDefault()
    }
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Shift') mods.shift = false
  if (event.key === 'Alt') mods.option = false
  if (event.key === ' ') mods.space = false
}

if (canvas instanceof HTMLCanvasElement) {
  window.addEventListener('resize', resizeCanvas)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.overlayApi.onReset(resetSelectionState)
  resizeCanvas()
}
