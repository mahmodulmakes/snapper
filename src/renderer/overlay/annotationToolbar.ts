import type { AnnotationTool, RectInPoints } from '../../shared/types'

// Lightshot-style vertical icon column anchored to the selection's right
// edge (BUILD-SPEC.md §2.4.2/§4.5a) — lives inside the overlay window
// itself, same as the horizontal Copy/Save toolbar, no separate window.

const TOOLS: AnnotationTool[] = ['arrow', 'rectangle', 'oval', 'line']
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#000000']
const DEFAULT_COLOR = COLORS[0] as string
const TOOLBAR_GAP_PX = 8

const container = document.getElementById('annotation-toolbar')
const colorPopover = document.getElementById('annotation-color-popover')
const colorToggle = document.getElementById('annotation-color-toggle')
const colorSwatch = document.getElementById('annotation-color-swatch')
const undoButton = document.getElementById('annotation-undo')

// No tool active by default — a plain click inside the selection moves it
// (see main.ts's mousedown handling) rather than drawing, until the user
// explicitly picks a tool. Picking the already-active tool again deselects
// it, back to move mode.
let activeTool: AnnotationTool | null = null
let activeColor = DEFAULT_COLOR
let onToolChange: ((tool: AnnotationTool | null) => void) | null = null
let onColorChange: ((color: string) => void) | null = null
let onUndo: (() => void) | null = null

function updateToolButtonStates(): void {
  for (const tool of TOOLS) {
    document.getElementById(`tool-${tool}`)?.classList.toggle('active', tool === activeTool)
  }
}

function updateColorSwatch(): void {
  if (colorSwatch instanceof HTMLElement) colorSwatch.style.backgroundColor = activeColor
  if (colorPopover) {
    for (const child of Array.from(colorPopover.children)) {
      if (child instanceof HTMLElement) child.classList.toggle('active', child.dataset['color'] === activeColor)
    }
  }
}

function selectTool(tool: AnnotationTool): void {
  activeTool = activeTool === tool ? null : tool
  updateToolButtonStates()
  onToolChange?.(activeTool)
}

/**
 * `#annotation-color-popover` is `position: fixed` with no left/top ever
 * set — without this, it renders at its default (0,0), the page's top-left
 * corner, nowhere near the toggle button that opened it. Measures
 * `offsetWidth`/`offsetHeight` AFTER the caller has already added `.visible`
 * (display:flex), since both read as 0 while still display:none.
 */
function positionColorPopover(): void {
  if (!colorPopover || !colorToggle || !container) return
  const toggleRect = colorToggle.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const gap = 8

  let left = containerRect.right + gap
  if (left + colorPopover.offsetWidth > window.innerWidth) {
    left = containerRect.left - colorPopover.offsetWidth - gap
  }
  left = Math.min(Math.max(left, 0), Math.max(0, window.innerWidth - colorPopover.offsetWidth))

  let top = toggleRect.top + toggleRect.height / 2 - colorPopover.offsetHeight / 2
  top = Math.min(Math.max(top, 0), Math.max(0, window.innerHeight - colorPopover.offsetHeight))

  colorPopover.style.left = `${left}px`
  colorPopover.style.top = `${top}px`
}

function selectColor(color: string): void {
  activeColor = color
  updateColorSwatch()
  colorPopover?.classList.remove('visible')
  onColorChange?.(color)
}

function buildColorPopover(): void {
  if (!colorPopover) return
  for (const color of COLORS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.style.backgroundColor = color
    button.dataset['color'] = color
    button.setAttribute('aria-label', `Color ${color}`)
    button.addEventListener('click', () => selectColor(color))
    colorPopover.appendChild(button)
  }

  const customInput = document.createElement('input')
  customInput.type = 'color'
  customInput.id = 'annotation-color-custom'
  customInput.value = DEFAULT_COLOR
  customInput.setAttribute('aria-label', 'Custom color')
  customInput.addEventListener('input', () => selectColor(customInput.value))
  colorPopover.appendChild(customInput)
}

/** Wires every click handler once, at module load — call before `show()`. */
export function init(handlers: {
  onToolChange: (tool: AnnotationTool | null) => void
  onColorChange: (color: string) => void
  onUndo: () => void
}): void {
  onToolChange = handlers.onToolChange
  onColorChange = handlers.onColorChange
  onUndo = handlers.onUndo

  for (const tool of TOOLS) {
    document.getElementById(`tool-${tool}`)?.addEventListener('click', () => selectTool(tool))
  }
  undoButton?.addEventListener('click', () => onUndo?.())
  colorToggle?.addEventListener('click', () => {
    const opening = !colorPopover?.classList.contains('visible')
    colorPopover?.classList.toggle('visible')
    if (opening) positionColorPopover()
  })
  buildColorPopover()
  updateToolButtonStates()
  updateColorSwatch()
}

/** Positions and reveals the toolbar at the selection's right edge, flipping to the left edge if it would go off-screen. Resets to the default tool/color for a fresh selection. */
export function show(rect: RectInPoints, boundsWidth: number, boundsHeight: number): void {
  if (!container) return
  activeTool = null
  activeColor = DEFAULT_COLOR
  updateToolButtonStates()
  updateColorSwatch()
  container.classList.add('visible')

  const toolbarWidth = container.offsetWidth
  const toolbarHeight = container.offsetHeight

  let left = rect.x + rect.width + TOOLBAR_GAP_PX
  if (left + toolbarWidth > boundsWidth) {
    left = rect.x - toolbarWidth - TOOLBAR_GAP_PX
  }
  left = Math.min(Math.max(left, 0), Math.max(0, boundsWidth - toolbarWidth))

  // Bottom-aligned with the selection (Lightshot anchors its tool column to
  // the bottom, not the top) — grows upward from the selection's bottom edge.
  const top = Math.min(Math.max(rect.y + rect.height - toolbarHeight, 0), Math.max(0, boundsHeight - toolbarHeight))

  container.style.left = `${left}px`
  container.style.top = `${top}px`
}

export function hide(): void {
  container?.classList.remove('visible')
  colorPopover?.classList.remove('visible')
}

export function getActiveTool(): AnnotationTool | null {
  return activeTool
}

export function getActiveColor(): string {
  return activeColor
}

export function setUndoEnabled(enabled: boolean): void {
  if (undoButton instanceof HTMLButtonElement) undoButton.disabled = !enabled
}
