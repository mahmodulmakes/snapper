import Store from 'electron-store'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaults'
import type { ShortcutActionId, ShortcutBindings } from '../../shared/types'

export interface SettingsSchema {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
}

let store: Store<SettingsSchema> | null = null

/**
 * electron-store's `defaults` only seeds a key that's entirely absent from
 * an existing settings file — it does not deep-merge new keys into an
 * already-present `shortcuts` object. Without this, a settings file written
 * before `captureText` existed (any dev/beta install predating this feature)
 * would silently have no binding for it — not a conflict, just missing —
 * until the user manually rebound it in Settings. Beta-scale concern only;
 * revisit with a real migration story before Phase 7 ships to real users.
 */
function backfillMissingShortcuts(s: Store<SettingsSchema>): void {
  const current = s.get('shortcuts')
  const missing = (Object.keys(DEFAULT_SHORTCUTS) as ShortcutActionId[]).filter((id) => !(id in current))
  if (missing.length === 0) return
  const patched = { ...current }
  for (const id of missing) patched[id] = DEFAULT_SHORTCUTS[id]
  s.set('shortcuts', patched)
}

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
    backfillMissingShortcuts(store)
  }
  return store
}
