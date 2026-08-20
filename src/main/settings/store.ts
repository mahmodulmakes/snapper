import Store from 'electron-store'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaults'
import type { ShortcutBindings } from '../../shared/types'

export interface SettingsSchema {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
}

let store: Store<SettingsSchema> | null = null

/**
 * Lazily constructed — electron-store reads `app.getPath('userData')`
 * internally, which needs the app to be ready.
 */
export function getSettingsStore(): Store<SettingsSchema> {
  if (!store) {
    store = new Store<SettingsSchema>({
      name: 'settings',
      defaults: {
        launchAtLogin: true,
        shortcuts: DEFAULT_SHORTCUTS,
        shortcutsPaused: false
      }
    })
  }
  return store
}
