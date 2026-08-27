import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { drawShape, isDegenerateShape, type EditorShape } from './shapes'
import type { EditorTool } from '../../shared/types'

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#000000'] as const

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'arrow', label: 'Arrow' },
  { id: 'rectangle', label: 'Box' },
  { id: 'oval', label: 'Oval' },
  { id: 'line', label: 'Line' }
]

type LoadStatus = 'loading' | 'ready' | 'error'

export default function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const shapesRef = useRef<EditorShape[]>([])
  const liveShapeRef = useRef<EditorShape | null>(null)
  const drawingRef = useRef(false)
  const lineWidthRef = useRef(4)

  const [tool, setTool] = useState<EditorTool>('arrow')
  const [color, setColor] = useState<string>(COLORS[0])
  const [shapeCount, setShapeCount] = useState(0)
  const [status, setStatus] = useState<LoadStatus>('loading')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !image || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    for (const shape of shapesRef.current) drawShape(ctx, shape)
    if (liveShapeRef.current) drawShape(ctx, liveShapeRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    window.editorApi
      .getImage()
      .then((payload) => {
        if (cancelled) return
        if (!payload) {
          setStatus('error')
          return
        }
        const img = new Image()
        img.onload = (): void => {
          if (cancelled) return
          imageRef.current = img
          const canvas = canvasRef.current
          if (canvas) {
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
          }
          lineWidthRef.current = Math.max(4, Math.round(Math.min(img.naturalWidth, img.naturalHeight) / 200))
          setStatus('ready')
          redraw()
        }
        img.onerror = (): void => {
          if (!cancelled) setStatus('error')
        }
        img.src = payload.dataUrl
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [redraw])

  /**
   * The canvas's backing store is the captured image's native pixel size;
   * CSS scales it down to fit the window. This maps a mouse event's CSS
   * coordinates back into that backing-store space — a canvas
   * display-vs-buffer conversion local to this renderer, not a macOS display
   * `scaleFactor` (CLAUDE.md Hard Rule 3 is about the capture pipeline; see
   * renderer/overlay/main.ts's `resizeCanvas` for the same distinction).
   */
  const toCanvasPoint = useCallback((event: ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height
    return { x: (event.clientX - bounds.left) * scaleX, y: (event.clientY - bounds.top) * scaleY }
  }, [])

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      if (status !== 'ready') return
      const { x, y } = toCanvasPoint(event)
      drawingRef.current = true
      liveShapeRef.current = { tool, color, lineWidthInPixels: lineWidthRef.current, x0: x, y0: y, x1: x, y1: y }
      redraw()
    },
    [tool, color, status, toCanvasPoint, redraw]
  )

  const onMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || !liveShapeRef.current) return
      const { x, y } = toCanvasPoint(event)
      liveShapeRef.current = { ...liveShapeRef.current, x1: x, y1: y }
      redraw()
    },
    [toCanvasPoint, redraw]
  )

  const finishShape = useCallback(() => {
    if (!drawingRef.current || !liveShapeRef.current) return
    drawingRef.current = false
    const shape = liveShapeRef.current
    liveShapeRef.current = null
    if (!isDegenerateShape(shape)) {
      shapesRef.current = [...shapesRef.current, shape]
      setShapeCount(shapesRef.current.length)
    }
    redraw()
  }, [redraw])

  const onUndo = useCallback(() => {
    if (shapesRef.current.length === 0) return
    shapesRef.current = shapesRef.current.slice(0, -1)
    setShapeCount(shapesRef.current.length)
    redraw()
  }, [redraw])

  const flattenedPngDataUrl = useCallback((): string | null => canvasRef.current?.toDataURL('image/png') ?? null, [])

  const onCopy = useCallback(() => {
    if (status !== 'ready') return
    const dataUrl = flattenedPngDataUrl()
    if (dataUrl) window.editorApi.exportCopy(dataUrl)
  }, [status, flattenedPngDataUrl])

  const onSave = useCallback(() => {
    if (status !== 'ready') return
    const dataUrl = flattenedPngDataUrl()
    if (dataUrl) window.editorApi.exportSave(dataUrl)
  }, [status, flattenedPngDataUrl])

  const onCancel = useCallback(() => {
    window.editorApi.cancel()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        onUndo()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        onCopy()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, onUndo, onCopy])

  if (status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-sm text-red-400">
        Could not load the captured screenshot.
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tool === t.id ? 'bg-blue-500 text-white' : 'text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-blue-400' : 'border-neutral-700'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="Custom color"
            className="h-6 w-6 cursor-pointer rounded-md border border-neutral-700 bg-transparent p-0"
          />
        </div>

        <button
          type="button"
          onClick={onUndo}
          disabled={shapeCount === 0}
          className="rounded-md px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          Undo
        </button>

        <div className="flex-1" />

        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-neutral-800">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={status !== 'ready'}
          className="rounded-md px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={status !== 'ready'}
          className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
        >
          Copy
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {status === 'loading' && <span className="text-sm text-neutral-500">Loading…</span>}
        <canvas
          ref={canvasRef}
          className={status === 'ready' ? 'max-h-full max-w-full cursor-crosshair rounded shadow-lg' : 'hidden'}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={finishShape}
          onMouseLeave={finishShape}
        />
      </div>
    </div>
  )
}
