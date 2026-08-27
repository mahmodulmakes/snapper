import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { EditorExportPayload, EditorImagePayload } from '../shared/types'

contextBridge.exposeInMainWorld('editorApi', {
  getImage: (): Promise<EditorImagePayload | null> => ipcRenderer.invoke(IPC.EDITOR_GET_IMAGE),
  exportCopy: (pngDataUrl: string): void =>
    ipcRenderer.send(IPC.EDITOR_EXPORT_COPY, { pngDataUrl } satisfies EditorExportPayload),
  exportSave: (pngDataUrl: string): void =>
    ipcRenderer.send(IPC.EDITOR_EXPORT_SAVE, { pngDataUrl } satisfies EditorExportPayload),
  cancel: (): void => ipcRenderer.send(IPC.EDITOR_CANCEL)
})
