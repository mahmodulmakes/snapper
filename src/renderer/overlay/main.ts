// Selection UI, magnifier loupe, and modifier-key handling land in Phase 3.
const canvas = document.getElementById('overlay-canvas')

if (canvas instanceof HTMLCanvasElement) {
  const resize = (): void => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  window.addEventListener('resize', resize)
  resize()
}
