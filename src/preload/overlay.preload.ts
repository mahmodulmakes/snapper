import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7). Selection/capture IPC
// (Phase 3) will grow this surface — keep it narrow and typed.
contextBridge.exposeInMainWorld('overlayApi', {
  dismiss: (): void => ipcRenderer.send(IPC.OVERLAY_DISMISS)
})
