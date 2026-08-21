import type { DragModifiersPayload, OverlaySelectionStatePayload, PointInPoints, RectInPoints } from '../../shared/types'

export interface OverlayApi {
  dismiss: () => void
  copySelection: (rect: RectInPoints) => void
  saveSelection: (rect: RectInPoints) => void
  captureFullPage: (rect: RectInPoints) => void
  onReset: (callback: () => void) => void
  startDrag: (anchorInPoints: PointInPoints, modifiers: DragModifiersPayload) => void
  sendDragModifiers: (modifiers: DragModifiersPayload) => void
  endDrag: () => void
  onSelectionState: (callback: (payload: OverlaySelectionStatePayload) => void) => void
  nudgeSelection: (dx: number, dy: number) => void
  redoSelection: () => void
  getCaptureSourceId: () => Promise<string | null>
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}
