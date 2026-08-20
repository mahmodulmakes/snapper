// Selection UI, magnifier loupe, and modifier-key handling land in Phase 3.
// For now: dim the display (BUILD-SPEC.md §4.2 step 2) and let Escape
// dismiss, so the window pool itself is visually verifiable.
const canvas = document.getElementById('overlay-canvas')

if (canvas instanceof HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')

  const render = (): void => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    if (!ctx) return
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  window.addEventListener('resize', render)
  render()
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.overlayApi.dismiss()
  }
})
