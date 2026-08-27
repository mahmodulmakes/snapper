export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  OVERLAY_DISMISS: 'overlay:dismiss',
  OVERLAY_ACTION_COPY: 'overlay:action-copy',
  OVERLAY_ACTION_SAVE: 'overlay:action-save',
  OVERLAY_RESET: 'overlay:reset',
  OVERLAY_DRAG_START: 'overlay:drag-start',
  OVERLAY_DRAG_MODIFIERS: 'overlay:drag-modifiers',
  OVERLAY_DRAG_END: 'overlay:drag-end',
  OVERLAY_SELECTION_STATE: 'overlay:selection-state',
  OVERLAY_SELECTION_NUDGE: 'overlay:selection-nudge',
  OVERLAY_SELECTION_REDO: 'overlay:selection-redo',
  OVERLAY_GET_CAPTURE_SOURCE_ID: 'overlay:get-capture-source-id',
  ONBOARDING_OPEN_SETTINGS: 'onboarding:open-settings',
  ONBOARDING_RESTART: 'onboarding:restart',
  SETTINGS_GET_STATE: 'settings:get-state',
  SETTINGS_SET_LAUNCH_AT_LOGIN: 'settings:set-launch-at-login',
  SETTINGS_SET_SHORTCUTS_PAUSED: 'settings:set-shortcuts-paused',
  SETTINGS_SET_SHORTCUT: 'settings:set-shortcut',
  SETTINGS_SET_SAVE_TO_DISK: 'settings:set-save-to-disk',
  SETTINGS_CHOOSE_SAVE_FOLDER: 'settings:choose-save-folder',
  SETTINGS_OPEN_KEYBOARD_SETTINGS: 'settings:open-keyboard-settings',
  TEXT_CAPTURE_START: 'text-capture:start',
  TEXT_CAPTURE_RESULT: 'text-capture:result',
  TEXT_CAPTURE_COPY: 'text-capture:copy',
  TEXT_CAPTURE_CANCEL: 'text-capture:cancel'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
