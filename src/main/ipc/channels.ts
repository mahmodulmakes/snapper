export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
