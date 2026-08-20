export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss',
  OVERLAY_SELECTION_COMPLETE: 'overlay:selection-complete',
  OVERLAY_RESET: 'overlay:reset',
  ONBOARDING_OPEN_SETTINGS: 'onboarding:open-settings',
  ONBOARDING_RESTART: 'onboarding:restart'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
