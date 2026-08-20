import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { RectInPoints } from '../shared/types'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7).
contextBridge.exposeInMainWorld('overlayApi', {
  dismiss: (): void => ipcRenderer.send(IPC.OVERLAY_DISMISS),
  copySelection: (rect: RectInPoints): void => ipcRenderer.send(IPC.OVERLAY_ACTION_COPY, rect),
  saveSelection: (rect: RectInPoints): void => ipcRenderer.send(IPC.OVERLAY_ACTION_SAVE, rect),
  onReset: (callback: () => void): void => {
    ipcRenderer.on(IPC.OVERLAY_RESET, () => callback())
  }
})
