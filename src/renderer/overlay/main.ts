// Magnifier loupe and window-under-cursor detection are not built yet —
// everything else from BUILD-SPEC.md §4.2/§4.3's region capture flow lives here.
import {
  clampRectToBounds,
  computeDragRect,
  nudgeRect,
  type Point,
  type Rect
} from './selectionMath'

const canvas = document.getElementById('overlay-canvas')
const ctx = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null
const toolbar = document.getElementById('toolbar')

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

/**
 * Anchored below the selection, flipped above if it'd go offscreen, clamped
 * to display bounds (BUILD-SPEC.md §4.3). Lives inside the overlay window
 * itself — inherits always-on-top for free, no separate window needed.
 */
function positionToolbar(rect: Rect): void {
  if (!toolbar) return
  toolbar.classList.add('visible')

  const toolbarWidth = toolbar.offsetWidth
  const toolbarHeight = toolbar.offsetHeight
  const gap = 8
  const { width: boundsWidth, height: boundsHeight } = bounds()

  let left = rect.x + rect.width / 2 - toolbarWidth / 2
  let top = rect.y + rect.height + gap
  if (top + toolbarHeight > boundsHeight) {
    top = rect.y - toolbarHeight - gap
  }
  top = Math.min(Math.max(top, 0), Math.max(0, boundsHeight - toolbarHeight))
  left = Math.min(Math.max(left, 0), Math.max(0, boundsWidth - toolbarWidth))

  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

function hideToolbar(): void {
  toolbar?.classList.remove('visible')
}

function resetSelectionState(): void {
  dragging = false
  anchor = null
  lastMouse = null
  liveRect = null
  selection = null
  hideToolbar()
  render()
}

function onMouseDown(event: MouseEvent): void {
  const point: Point = { x: event.clientX, y: event.clientY }
  anchor = point
  lastMouse = point
  dragging = true
  selection = null
  hideToolbar()
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
    positionToolbar(selection)
  } else {
    hideToolbar()
  }
  liveRect = null
  anchor = null
  lastMouse = null
  render()
}

function triggerCopy(): void {
  if (!selection) return
  hideToolbar()
  window.overlayApi.copySelection(selection)
}

function triggerSave(): void {
  if (!selection) return
  hideToolbar()
  window.overlayApi.saveSelection(selection)
}

function triggerRedo(): void {
  hideToolbar()
  selection = null
  liveRect = null
  render()
}

function triggerCancel(): void {
  // Reset local state immediately rather than relying solely on the next
  // OVERLAY_RESET (which only fires right before the window is shown again)
  // — the window is about to hide either way, but leaving stale toolbar/
  // selection state hanging around between now and then is a needless trap.
  hideToolbar()
  selection = null
  liveRect = null
  window.overlayApi.dismiss()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    triggerCancel()
    return
  }
  if (event.key === 'Enter' && selection && !dragging) {
    // Default action on Enter is a setting (most users: Copy) — hardcoded
    // until the Settings window (Phase 5) can configure it.
    event.preventDefault()
    triggerCopy()
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
      positionToolbar(selection)
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

  document.getElementById('toolbar-copy')?.addEventListener('click', triggerCopy)
  document.getElementById('toolbar-save')?.addEventListener('click', triggerSave)
  document.getElementById('toolbar-redo')?.addEventListener('click', triggerRedo)
  document.getElementById('toolbar-cancel')?.addEventListener('click', triggerCancel)

  resizeCanvas()
}
