import type { SettingsState, ShortcutActionId } from '../../shared/types'

export interface SettingsApi {
  getState: () => Promise<SettingsState>
  setLaunchAtLogin: (enabled: boolean) => void
  setShortcutsPaused: (paused: boolean) => void
  setShortcut: (id: ShortcutActionId, accelerator: string) => Promise<boolean>
  openKeyboardSettings: () => void
}

declare global {
  interface Window {
    settingsApi: SettingsApi
  }
}
