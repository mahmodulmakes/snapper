import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type {
  AnnotationShape,
  DragModifiersPayload,
  OverlayExportPayload,
  OverlayMoveStartPayload,
  OverlayResetPayload,
  OverlayResizeStartPayload,
  OverlaySelectionStatePayload,
  PointInPoints,
  RectInPoints,
  SelectionHandleId,
  TextCaptureResultPayload
} from '../shared/types'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7).
contextBridge.exposeInMainWorld('overlayApi', {
  dismiss: (): void => ipcRenderer.send(IPC.OVERLAY_DISMISS),
  copySelection: (rectInPoints: RectInPoints, shapes: AnnotationShape[]): void =>
    ipcRenderer.send(IPC.OVERLAY_ACTION_COPY, { rectInPoints, shapes } satisfies OverlayExportPayload),
  saveSelection: (rectInPoints: RectInPoints, shapes: AnnotationShape[]): void =>
    ipcRenderer.send(IPC.OVERLAY_ACTION_SAVE, { rectInPoints, shapes } satisfies OverlayExportPayload),
  onReset: (callback: (payload: OverlayResetPayload) => void): void => {
    ipcRenderer.on(IPC.OVERLAY_RESET, (_event, payload: OverlayResetPayload) => callback(payload))
  },
  startDrag: (anchorInPoints: PointInPoints, modifiers: DragModifiersPayload): void => {
    ipcRenderer.send(IPC.OVERLAY_DRAG_START, { anchorInPoints, modifiers })
  },
  sendDragModifiers: (modifiers: DragModifiersPayload): void => {
    ipcRenderer.send(IPC.OVERLAY_DRAG_MODIFIERS, { modifiers })
  },
  endDrag: (): void => ipcRenderer.send(IPC.OVERLAY_DRAG_END),
  onSelectionState: (callback: (payload: OverlaySelectionStatePayload) => void): void => {
    ipcRenderer.on(IPC.OVERLAY_SELECTION_STATE, (_event, payload: OverlaySelectionStatePayload) => callback(payload))
  },
  nudgeSelection: (dx: number, dy: number): void => {
    ipcRenderer.send(IPC.OVERLAY_SELECTION_NUDGE, { dx, dy })
  },
  startResize: (handle: SelectionHandleId): void => {
    ipcRenderer.send(IPC.OVERLAY_RESIZE_START, { handle } satisfies OverlayResizeStartPayload)
  },
  startMove: (anchorInPoints: PointInPoints): void => {
    ipcRenderer.send(IPC.OVERLAY_MOVE_START, { anchorInPoints } satisfies OverlayMoveStartPayload)
  },
  getCaptureSourceId: (): Promise<string | null> => ipcRenderer.invoke(IPC.OVERLAY_GET_CAPTURE_SOURCE_ID),
  onTextCaptureResult: (callback: (payload: TextCaptureResultPayload) => void): void => {
    ipcRenderer.on(IPC.TEXT_CAPTURE_RESULT, (_event, payload: TextCaptureResultPayload) => callback(payload))
  },
  copyTextCapture: (text: string): void => ipcRenderer.send(IPC.TEXT_CAPTURE_COPY, { text })
})
