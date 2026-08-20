export interface AppVersionInfo {
  version: string
}

/** A rectangle in window-local points, as reported by the overlay renderer. */
export interface RectInPoints {
  x: number
  y: number
  width: number
  height: number
}

export type ShortcutActionId = 'captureArea' | 'captureFullScreen'

export type ShortcutBindings = Record<ShortcutActionId, string>

export interface SettingsState {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
}
