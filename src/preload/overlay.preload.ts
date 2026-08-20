import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { RectInPoints } from '../shared/types'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7). Selection/capture IPC
// (Phase 3) will grow this surface — keep it narrow and typed.
contextBridge.exposeInMainWorld('overlayApi', {
  dismiss: (): void => ipcRenderer.send(IPC.OVERLAY_DISMISS),
  completeSelection: (rect: RectInPoints): void => ipcRenderer.send(IPC.OVERLAY_SELECTION_COMPLETE, rect),
  onReset: (callback: () => void): void => {
    ipcRenderer.on(IPC.OVERLAY_RESET, () => callback())
  }
})
