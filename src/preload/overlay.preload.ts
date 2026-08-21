import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type {
  DragModifiersPayload,
  OverlaySelectionStatePayload,
  PointInPoints,
  RectInPoints
} from '../shared/types'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7).
contextBridge.exposeInMainWorld('overlayApi', {
  dismiss: (): void => ipcRenderer.send(IPC.OVERLAY_DISMISS),
  copySelection: (rect: RectInPoints): void => ipcRenderer.send(IPC.OVERLAY_ACTION_COPY, rect),
  saveSelection: (rect: RectInPoints): void => ipcRenderer.send(IPC.OVERLAY_ACTION_SAVE, rect),
  onReset: (callback: () => void): void => {
    ipcRenderer.on(IPC.OVERLAY_RESET, () => callback())
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
  redoSelection: (): void => ipcRenderer.send(IPC.OVERLAY_SELECTION_REDO),
  getCaptureSourceId: (): Promise<string | null> => ipcRenderer.invoke(IPC.OVERLAY_GET_CAPTURE_SOURCE_ID)
})
