import { contextBridge } from 'electron'

// Vanilla TS + Canvas renderer (BUILD-SPEC.md §3.7) — no API surface yet.
// Populate via contextBridge.exposeInMainWorld once selection IPC lands (Phase 3).
contextBridge.exposeInMainWorld('overlayApi', {})
