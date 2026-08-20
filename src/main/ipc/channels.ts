export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss',
  OVERLAY_ACTION_COPY: 'overlay:action-copy',
  OVERLAY_ACTION_SAVE: 'overlay:action-save',
  OVERLAY_RESET: 'overlay:reset',
  ONBOARDING_OPEN_SETTINGS: 'onboarding:open-settings',
  ONBOARDING_RESTART: 'onboarding:restart'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
