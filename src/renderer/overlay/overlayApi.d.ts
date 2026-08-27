import type {
  AnnotationShape,
  DragModifiersPayload,
  OverlayResetPayload,
  OverlaySelectionStatePayload,
  PointInPoints,
  RectInPoints,
  SelectionHandleId,
  TextCaptureResultPayload
} from '../../shared/types'

export interface OverlayApi {
  dismiss: () => void
  copySelection: (rectInPoints: RectInPoints, shapes: AnnotationShape[]) => void
  saveSelection: (rectInPoints: RectInPoints, shapes: AnnotationShape[]) => void
  onReset: (callback: (payload: OverlayResetPayload) => void) => void
  startDrag: (anchorInPoints: PointInPoints, modifiers: DragModifiersPayload) => void
  sendDragModifiers: (modifiers: DragModifiersPayload) => void
  endDrag: () => void
  onSelectionState: (callback: (payload: OverlaySelectionStatePayload) => void) => void
  nudgeSelection: (dx: number, dy: number) => void
  redoSelection: () => void
  startResize: (handle: SelectionHandleId) => void
  startMove: (anchorInPoints: PointInPoints) => void
  getCaptureSourceId: () => Promise<string | null>
  onTextCaptureResult: (callback: (payload: TextCaptureResultPayload) => void) => void
  copyTextCapture: (text: string) => void
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}
