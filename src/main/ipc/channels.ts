export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss',
  OVERLAY_SELECTION_COMPLETE: 'overlay:selection-complete',
  OVERLAY_RESET: 'overlay:reset'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
