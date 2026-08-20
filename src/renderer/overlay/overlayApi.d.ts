import type { RectInPoints } from '../../shared/types'

export interface OverlayApi {
  dismiss: () => void
  completeSelection: (rect: RectInPoints) => void
  onReset: (callback: () => void) => void
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}
