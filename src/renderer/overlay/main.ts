// Window-under-cursor detection is not built yet — everything else from
// BUILD-SPEC.md §4.2/§4.3's region capture flow lives here. Drag-rect
// *computation* lives in the main process (main/overlay/dragCoordinator.ts)
// so a drag crossing a display boundary stays correct — this file only
// reflects whatever main broadcasts and forwards raw input (mousedown/up,
// modifier keys) back to it.
import { hideLoupe, startMagnifier, stopMagnifier, updateMagnifier } from './magnifier'
import type { OverlaySelectionStatePayload, PointInPoints, RectInPoints } from '../../shared/types'

const canvas = document.getElementById('overlay-canvas')
const ctx = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null
const toolbar = document.getElementById('toolbar')

let dragging = false
let liveRect: RectInPoints | null = null
let selection: RectInPoints | null = null
let isToolbarHost = false
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

function drawBadge(rect: RectInPoints): void {
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
  // A cross-display selection's rect may fall partly or entirely outside
  // this window's own canvas — clearRect/strokeRect silently no-op past the
  // canvas edge, so no intersection check is needed here, only in main.
  if (!rect) return

  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, rect.width - 1, rect.height - 1)
  drawBadge(rect)
}

function currentModifiers(): { square: boolean; fromCenter: boolean; space: boolean } {
  return { square: mods.shift, fromCenter: mods.option, space: mods.space }
}

/**
 * Anchored below the selection, flipped above if it'd go offscreen, clamped
 * to display bounds (BUILD-SPEC.md §4.3). Lives inside the overlay window
 * itself — inherits always-on-top for free, no separate window needed.
 */
function positionToolbar(rect: RectInPoints): void {
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
  liveRect = null
  selection = null
  isToolbarHost = false
  hideToolbar()
  render()
  startMagnifier()
}

/** Magnifier loupe (BUILD-SPEC.md §4.2 step 3) — idle only, see magnifier.ts's header comment. */
function onIdleMouseMove(event: MouseEvent): void {
  if (dragging || selection) return
  updateMagnifier(event.clientX, event.clientY)
}

function onMouseDown(event: MouseEvent): void {
  const anchorInPoints: PointInPoints = { x: event.clientX, y: event.clientY }
  dragging = true
  selection = null
  isToolbarHost = false
  hideToolbar()
  hideLoupe()
  window.overlayApi.startDrag(anchorInPoints, currentModifiers())
}

function onMouseUp(): void {
  if (!dragging) return
  dragging = false
  window.overlayApi.endDrag()
}

function onSelectionState(payload: OverlaySelectionStatePayload): void {
  if (payload.phase === 'dragging') {
    liveRect = payload.rectInPoints
    selection = null
    isToolbarHost = false
    hideToolbar()
    hideLoupe()
    render()
    return
  }

  liveRect = null
  isToolbarHost = payload.isToolbarHost
  if (payload.rectInPoints.width < 2 || payload.rectInPoints.height < 2) {
    selection = null
    hideToolbar()
    render()
    return
  }

  selection = payload.rectInPoints
  hideLoupe()
  if (isToolbarHost) {
    positionToolbar(selection)
  } else {
    hideToolbar()
  }
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

function triggerFullPage(): void {
  if (!selection) return
  hideToolbar()
  window.overlayApi.captureFullPage(selection)
}

function triggerRedo(): void {
  hideToolbar()
  window.overlayApi.redoSelection()
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
  if (dragging) {
    window.overlayApi.sendDragModifiers(currentModifiers())
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
      window.overlayApi.nudgeSelection(dx, dy)
      event.preventDefault()
    }
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Shift') mods.shift = false
  if (event.key === 'Alt') mods.option = false
  if (event.key === ' ') mods.space = false
  if (dragging) {
    window.overlayApi.sendDragModifiers(currentModifiers())
  }
}

function onVisibilityChange(): void {
  // Covers every path that hides this window (cancel, copy, save) uniformly
  // — those don't all route through a dedicated "you're being hidden" IPC
  // message, but the Page Visibility API reflects it regardless of cause.
  if (document.hidden) stopMagnifier()
}

if (canvas instanceof HTMLCanvasElement) {
  window.addEventListener('resize', resizeCanvas)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onIdleMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.overlayApi.onReset(resetSelectionState)
  window.overlayApi.onSelectionState(onSelectionState)

  document.getElementById('toolbar-copy')?.addEventListener('click', triggerCopy)
  document.getElementById('toolbar-save')?.addEventListener('click', triggerSave)
  document.getElementById('toolbar-full-page')?.addEventListener('click', triggerFullPage)
  document.getElementById('toolbar-redo')?.addEventListener('click', triggerRedo)
  document.getElementById('toolbar-cancel')?.addEventListener('click', triggerCancel)

  resizeCanvas()
}
