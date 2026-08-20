import type { RectInPoints } from '../../shared/types'

export interface OverlayApi {
  dismiss: () => void
  copySelection: (rect: RectInPoints) => void
  saveSelection: (rect: RectInPoints) => void
  onReset: (callback: () => void) => void
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}
