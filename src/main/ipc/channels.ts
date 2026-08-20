export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss',
  OVERLAY_ACTION_COPY: 'overlay:action-copy',
  OVERLAY_ACTION_SAVE: 'overlay:action-save',
  OVERLAY_RESET: 'overlay:reset',
  ONBOARDING_OPEN_SETTINGS: 'onboarding:open-settings',
  ONBOARDING_RESTART: 'onboarding:restart',
  SETTINGS_GET_STATE: 'settings:get-state',
  SETTINGS_SET_LAUNCH_AT_LOGIN: 'settings:set-launch-at-login',
  SETTINGS_SET_SHORTCUTS_PAUSED: 'settings:set-shortcuts-paused',
  SETTINGS_SET_SHORTCUT: 'settings:set-shortcut',
  SETTINGS_OPEN_KEYBOARD_SETTINGS: 'settings:open-keyboard-settings'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
