import type { EditorImagePayload } from '../../shared/types'

export interface EditorApi {
  getImage: () => Promise<EditorImagePayload | null>
  exportCopy: (pngDataUrl: string) => void
  exportSave: (pngDataUrl: string) => void
  cancel: () => void
}

declare global {
  interface Window {
    editorApi: EditorApi
  }
}
