import { globalShortcut, powerMonitor } from 'electron'
import { getSettingsStore } from '../settings/store'
import { logger } from '../logger'
import { notifyFailure } from '../notify'
import type { ShortcutActionId } from '../../shared/types'

type ActionHandlers = Record<ShortcutActionId, () => void>

let handlers: ActionHandlers | null = null
let registeredAccelerators: Partial<Record<ShortcutActionId, string>> = {}
let onStateChangeCallback: (() => void) | null = null
let listenersRegistered = false
// registerAll() re-runs at startup, after every pause/resume toggle, and
// after every wake-from-sleep — without this, an unresolved conflict would
// re-notify the user every single time instead of once.
const notifiedConflicts = new Set<string>()

/** Settings/tray UI calls this to be told when bindings, conflicts, or pause state change. */
export function onShortcutStateChange(callback: () => void): void {
  onStateChangeCallback = callback
}

function notifyStateChange(): void {
  onStateChangeCallback?.()
}

function registerOne(id: ShortcutActionId, accelerator: string): boolean {
  if (!handlers) return false
  try {
    const ok = globalShortcut.register(accelerator, handlers[id])
    if (ok) {
      registeredAccelerators[id] = accelerator
      notifiedConflicts.delete(`${id}:${accelerator}`)
    } else {
      const key = `${id}:${accelerator}`
      if (notifiedConflicts.has(key)) {
        logger.error(`Shortcut conflict: "${accelerator}" for ${id} is already owned by another app.`)
      } else {
        notifiedConflicts.add(key)
        notifyFailure(
          'Shortcut unavailable',
          `"${accelerator}" is already used by another app, so ${id} won't respond to it. Change it in Settings.`
        )
      }
    }
    return ok
  } catch (err) {
    // Electron throws on a malformed accelerator string rather than returning false.
    logger.error(`Invalid accelerator "${accelerator}" for ${id}.`, err)
    return false
  }
}

function registerAll(): void {
  globalShortcut.unregisterAll()
  registeredAccelerators = {}
  if (!handlers) return

  if (getSettingsStore().get('shortcutsPaused')) {
    logger.info('Shortcuts paused; not registering.')
    notifyStateChange()
    return
  }

  const bindings = getSettingsStore().get('shortcuts')
  for (const id of Object.keys(bindings) as ShortcutActionId[]) {
    registerOne(id, bindings[id])
  }
  notifyStateChange()
}

/** Registers the default (or previously saved) shortcuts. Call once at startup. */
export function initShortcuts(actionHandlers: ActionHandlers): void {
  handlers = actionHandlers
  registerAll()

  if (!listenersRegistered) {
    // BUILD-SPEC.md §4.6: re-register after wake-from-sleep.
    powerMonitor.on('resume', () => {
      logger.info('Woke from sleep; re-registering shortcuts.')
      registerAll()
    })
    listenersRegistered = true
  }
}

export function teardownShortcuts(): void {
  globalShortcut.unregisterAll()
  registeredAccelerators = {}
  handlers = null
}

/** Which accelerator is actually live for each action right now (may differ from the store if a conflict was hit). */
export function getRegisteredAccelerators(): Partial<Record<ShortcutActionId, string>> {
  return { ...registeredAccelerators }
}

/**
 * True when `id`'s stored shortcut is NOT actually live right now because
 * another app already owns that key combination. Not true while shortcuts
 * are globally paused — that's an intentional, expected state, not a
 * conflict — and not true for an id that simply hasn't been registered yet
 * (before `initShortcuts` runs).
 */
export function isShortcutConflicted(id: ShortcutActionId): boolean {
  if (!handlers) return false
  if (getSettingsStore().get('shortcutsPaused')) return false
  return registeredAccelerators[id] === undefined
}

/**
 * Attempts to rebind one action (the Settings recorder widget). Returns
 * false on conflict and leaves the previous binding registered and
 * persisted — never silently drop a working shortcut for a broken one
 * (CLAUDE.md: detect conflicts, surface them, never fail silently).
 */
export function trySetShortcut(id: ShortcutActionId, accelerator: string): boolean {
  if (!handlers) return false
  const previous = registeredAccelerators[id]
  if (previous) globalShortcut.unregister(previous)

  const ok = registerOne(id, accelerator)
  if (ok) {
    const bindings = { ...getSettingsStore().get('shortcuts'), [id]: accelerator }
    getSettingsStore().set('shortcuts', bindings)
  } else if (previous) {
    registerOne(id, previous)
  }
  notifyStateChange()
  return ok
}

export function setShortcutsPaused(paused: boolean): void {
  getSettingsStore().set('shortcutsPaused', paused)
  registerAll()
}
