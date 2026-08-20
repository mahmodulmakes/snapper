import { contextBridge } from 'electron'

// Populate via contextBridge.exposeInMainWorld once the document model IPC lands (Phase 5).
contextBridge.exposeInMainWorld('editorApi', {})
