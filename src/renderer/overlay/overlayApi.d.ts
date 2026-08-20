export interface OverlayApi {
  dismiss: () => void
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}
