// Magnifier loupe (BUILD-SPEC.md §4.2 step 3): zoomed pixels + coordinates +
// hex color under the cursor, shown while idle (before a drag starts).
// Scoped to idle only — during an active drag the live rect is computed by
// the main process (main/overlay/dragCoordinator.ts) from the real OS
// cursor, not from this window's local mousemove, so a destination window
// in a cross-display drag never gets local mousemove events to update a
// loupe with; showing a stale/wrong-position loupe there would be worse
// than no loupe. Revisit if cross-display drag-time magnification is
// explicitly wanted.
//
// Uses a live desktopCapturer video stream, not screencapture — a small
// region capture via screencapture measured at ~85-90ms/call (subprocess
// spawn overhead), too slow to feel live. Never used for the actual
// screenshot output, which stays on screencapture unchanged.

const LOUPE_SOURCE_PIXELS = 15 // odd, so there's a true center pixel
const LOUPE_CANVAS_SIZE = 100 // must match index.html's canvas width/height
const LOUPE_OFFSET = 20 // CSS px gap between the cursor and the loupe panel

let stream: MediaStream | null = null
let video: HTMLVideoElement | null = null
let starting: Promise<void> | null = null

const container = document.getElementById('magnifier')
const loupeCanvas = document.getElementById('magnifier-canvas')
const loupeCtx = loupeCanvas instanceof HTMLCanvasElement ? loupeCanvas.getContext('2d') : null
const swatch = document.getElementById('magnifier-swatch')
const hexLabel = document.getElementById('magnifier-hex')
const coordsLabel = document.getElementById('magnifier-coords')

// Electron's desktopCapturer + getUserMedia constraints shape isn't part of
// the standard MediaTrackConstraints type.
interface ElectronDesktopMediaConstraints {
  audio: false
  video: {
    mandatory: {
      chromeMediaSource: 'desktop'
      chromeMediaSourceId: string
      minWidth: number
      maxWidth: number
      minHeight: number
      maxHeight: number
    }
  }
}

async function ensureStream(): Promise<void> {
  if (stream) return
  if (starting) return starting

  starting = (async () => {
    const sourceId = await window.overlayApi.getCaptureSourceId()
    if (!sourceId) return

    const dpr = window.devicePixelRatio || 1
    const widthPixels = Math.round(window.innerWidth * dpr)
    const heightPixels = Math.round(window.innerHeight * dpr)
    const constraints: ElectronDesktopMediaConstraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: widthPixels,
          maxWidth: widthPixels,
          minHeight: heightPixels,
          maxHeight: heightPixels
        }
      }
    }

    const newStream = await navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints)
    const newVideo = document.createElement('video')
    newVideo.muted = true
    newVideo.srcObject = newStream
    await newVideo.play()

    stream = newStream
    video = newVideo
  })()

  try {
    await starting
  } finally {
    starting = null
  }
}

export function startMagnifier(): void {
  ensureStream().catch((err: unknown) => {
    // Best-effort precision aid — a failure here (permission race, no
    // matching source yet) just means no loupe this session; the core
    // capture flow is unaffected, so this doesn't rise to a user-facing
    // notification. But it must still be logged — a silently-broken
    // magnifier with zero trace anywhere is undiagnosable. There's no
    // renderer-side logger in this codebase (main/logger.ts is main-process
    // only) and building an IPC error-reporting channel for one best-effort
    // cosmetic feature's rare failure path isn't proportionate.
    // eslint-disable-next-line no-console
    console.error('[magnifier] Could not start the capture stream.', err)
  })
}

export function stopMagnifier(): void {
  hideLoupe()
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video = null
}

export function hideLoupe(): void {
  container?.classList.remove('visible')
}

/** `clientX`/`clientY` are this window's local CSS points (same space as the rest of the overlay). */
export function updateMagnifier(clientX: number, clientY: number): void {
  if (!video || video.readyState < video.HAVE_CURRENT_DATA || !loupeCtx || !(loupeCanvas instanceof HTMLCanvasElement)) return

  const dpr = window.devicePixelRatio || 1
  const pixelX = Math.round(clientX * dpr)
  const pixelY = Math.round(clientY * dpr)
  const half = Math.floor(LOUPE_SOURCE_PIXELS / 2)
  const sourceX = Math.max(0, Math.min(video.videoWidth - LOUPE_SOURCE_PIXELS, pixelX - half))
  const sourceY = Math.max(0, Math.min(video.videoHeight - LOUPE_SOURCE_PIXELS, pixelY - half))

  loupeCtx.imageSmoothingEnabled = false
  loupeCtx.clearRect(0, 0, LOUPE_CANVAS_SIZE, LOUPE_CANVAS_SIZE)
  loupeCtx.drawImage(video, sourceX, sourceY, LOUPE_SOURCE_PIXELS, LOUPE_SOURCE_PIXELS, 0, 0, LOUPE_CANVAS_SIZE, LOUPE_CANVAS_SIZE)

  // Crosshair marking the exact sampled (center) pixel.
  const cellSize = LOUPE_CANVAS_SIZE / LOUPE_SOURCE_PIXELS
  const centerCell = pixelX - sourceX
  const centerCellY = pixelY - sourceY
  loupeCtx.strokeStyle = 'rgba(59, 130, 246, 0.9)'
  loupeCtx.lineWidth = 1
  loupeCtx.strokeRect(Math.round(centerCell * cellSize) + 0.5, Math.round(centerCellY * cellSize) + 0.5, cellSize - 1, cellSize - 1)

  // Clamp separately from sourceX/sourceY above — those clamp a whole
  // LOUPE_SOURCE_PIXELS-wide sample window, this clamps a single pixel.
  // Without it, the cursor at a display's far edge can round pixelX/pixelY
  // to exactly video.videoWidth/videoHeight (one past the last valid
  // index), which drawImage silently clips to nothing instead of erroring,
  // producing a bogus #000000 readout.
  const clampedPixelX = Math.max(0, Math.min(video.videoWidth - 1, pixelX))
  const clampedPixelY = Math.max(0, Math.min(video.videoHeight - 1, pixelY))
  const hex = sampleHexColor(clampedPixelX, clampedPixelY)
  if (hex && swatch instanceof HTMLElement && hexLabel) {
    swatch.style.background = hex
    hexLabel.textContent = hex
  }
  if (coordsLabel) coordsLabel.textContent = `${Math.round(clientX)}, ${Math.round(clientY)}`

  positionLoupe(clientX, clientY)
  container?.classList.add('visible')
}

let scratchCanvas: HTMLCanvasElement | null = null
let scratchCtx: CanvasRenderingContext2D | null = null

function sampleHexColor(pixelX: number, pixelY: number): string | null {
  if (!video) return null
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas')
    scratchCanvas.width = 1
    scratchCanvas.height = 1
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!scratchCtx) return null
  scratchCtx.drawImage(video, pixelX, pixelY, 1, 1, 0, 0, 1, 1)
  const [r, g, b] = scratchCtx.getImageData(0, 0, 1, 1).data
  if (r === undefined || g === undefined || b === undefined) return null
  const toHex = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function positionLoupe(clientX: number, clientY: number): void {
  if (!(container instanceof HTMLElement)) return
  const panelWidth = container.offsetWidth || LOUPE_CANVAS_SIZE
  const panelHeight = container.offsetHeight || LOUPE_CANVAS_SIZE
  let left = clientX + LOUPE_OFFSET
  let top = clientY + LOUPE_OFFSET
  if (left + panelWidth > window.innerWidth) left = clientX - LOUPE_OFFSET - panelWidth
  if (top + panelHeight > window.innerHeight) top = clientY - LOUPE_OFFSET - panelHeight
  left = Math.max(0, left)
  top = Math.max(0, top)
  container.style.left = `${left}px`
  container.style.top = `${top}px`
}
