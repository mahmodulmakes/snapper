import Store from 'electron-store'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaults'
import type { ShortcutActionId, ShortcutBindings } from '../../shared/types'

const DEFAULT_SHORTCUTS_ENABLED: Record<ShortcutActionId, boolean> = {
  captureArea: true,
  captureFullScreen: true,
  captureText: true
}

export interface SettingsSchema {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsEnabled: Record<ShortcutActionId, boolean>
  shortcutsPaused: boolean
}

let store: Store<SettingsSchema> | null = null

/**
 * electron-store's `defaults` only seeds a key that's entirely absent from
 * an existing settings file — it does not deep-merge new keys into an
 * already-present nested object. Without this, a settings file written
 * before some ShortcutActionId existed (any dev/beta install predating a
 * capture mode) would silently have no entry for it — not a conflict, just
 * missing — until the user manually touched that setting. Shared by both
 * `shortcuts` (accelerator strings) and `shortcutsEnabled` (on/off flags),
 * since they're keyed the same way and hit the identical gap. Beta-scale
 * concern only; revisit with a real migration story before Phase 7 ships to
 * real users.
 */
function backfillMissingActionKeys<Key extends 'shortcuts' | 'shortcutsEnabled'>(
  s: Store<SettingsSchema>,
  key: Key,
  defaults: SettingsSchema[Key]
): void {
  const current = s.get(key) as Record<ShortcutActionId, unknown>
  const missing = (Object.keys(defaults) as ShortcutActionId[]).filter((id) => !(id in current))
  if (missing.length === 0) return
  const patched = { ...current }
  for (const id of missing) patched[id] = (defaults as Record<ShortcutActionId, unknown>)[id]
  s.set(key, patched as SettingsSchema[Key])
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
        shortcutsEnabled: DEFAULT_SHORTCUTS_ENABLED,
        shortcutsPaused: false
      }
    })
    backfillMissingActionKeys(store, 'shortcuts', DEFAULT_SHORTCUTS)
    backfillMissingActionKeys(store, 'shortcutsEnabled', DEFAULT_SHORTCUTS_ENABLED)
  }
  return store
}
