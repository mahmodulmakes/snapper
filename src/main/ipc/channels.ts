export const IPC = {
  APP_GET_VERSION: 'app:get-version'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
