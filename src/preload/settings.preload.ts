import { contextBridge } from 'electron'

// Populate via contextBridge.exposeInMainWorld once settings IPC lands (Phase 6).
contextBridge.exposeInMainWorld('settingsApi', {})
