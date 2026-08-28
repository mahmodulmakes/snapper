import Store from 'electron-store'
import { DEFAULT_SHORTCUTS } from '../shortcuts/defaults'
import { defaultSaveDirectory } from '../output/fileWriter'
import type { ShortcutActionId, ShortcutBindings } from '../../shared/types'

export interface SettingsSchema {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
  saveToDisk: boolean
  saveDirectory: string
}

let store: Store<SettingsSchema> | null = null

/**
 * electron-store's `defaults` only seeds a key that's entirely absent from
 * an existing settings file — it does not deep-merge new keys into an
 * already-present nested object. Without this, a settings file written
 * before some ShortcutActionId existed (any dev/beta install predating a
 * capture mode) would silently have no entry for it — not a conflict, just
 * missing — until the user manually touched that setting. Beta-scale
 * concern only; revisit with a real migration story before Phase 7 ships to
 * real users.
 *
 * Also the last line of defense against a corrupted/hand-edited
 * settings.json: `current` is whatever raw JSON value was on disk under
 * this key, completely untyped despite the `Store<SettingsSchema>` generic
 * (electron-store doesn't validate against it at read time) — a `null`,
 * string, or array there would throw on the `in` operator below and take
 * down the entire startup sequence before the tray even exists. Rebuilding
 * from defaults on anything that isn't a plain object is deliberate: a
 * silently-reset shortcut is recoverable in Settings; a silently-dead app
 * is not.
 */
function backfillMissingShortcuts(s: Store<SettingsSchema>): void {
  const raw = s.get('shortcuts')
  const isPlainObject = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
  if (!isPlainObject) {
    s.set('shortcuts', DEFAULT_SHORTCUTS)
    return
  }

  const current = raw as Record<ShortcutActionId, unknown>
  const patched = { ...current } as Record<ShortcutActionId, string>
  let changed = false
  for (const id of Object.keys(DEFAULT_SHORTCUTS) as ShortcutActionId[]) {
    if (typeof current[id] !== 'string' || current[id] === '') {
      patched[id] = DEFAULT_SHORTCUTS[id]
      changed = true
    }
  }
  if (changed) s.set('shortcuts', patched)
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
        shortcutsPaused: false,
        saveToDisk: false,
        saveDirectory: defaultSaveDirectory()
      }
    })
    backfillMissingShortcuts(store)
  }
  return store
}
