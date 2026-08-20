import Store from 'electron-store'

export interface SettingsSchema {
  launchAtLogin: boolean
}

let store: Store<SettingsSchema> | null = null

/**
 * Lazily constructed — electron-store reads `app.getPath('userData')`
 * internally, which needs the app to be ready. Only fields actually
 * consumed somewhere get added here (BUILD-SPEC.md's output/shortcut
 * settings land alongside the Phase 4/5 code that reads them, not before).
 */
export function getSettingsStore(): Store<SettingsSchema> {
  if (!store) {
    store = new Store<SettingsSchema>({
      name: 'settings',
      defaults: {
        launchAtLogin: true
      }
    })
  }
  return store
}
