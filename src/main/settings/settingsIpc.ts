import { ipcMain, shell } from 'electron'
import { IPC } from '../ipc/channels'
import { notifyFailure } from '../notify'
import { setLaunchAtLogin } from './launchAtLogin'
import { getSettingsStore } from './store'
import { setShortcutEnabled, setShortcutsPaused, trySetShortcut } from '../shortcuts/shortcutManager'
import type { SettingsState, ShortcutActionId } from '../../shared/types'

let registered = false

function getState(): SettingsState {
  const store = getSettingsStore()
  return {
    launchAtLogin: store.get('launchAtLogin'),
    shortcuts: store.get('shortcuts'),
    shortcutsEnabled: store.get('shortcutsEnabled'),
    shortcutsPaused: store.get('shortcutsPaused')
  }
}

export function initSettingsIpc(): void {
  if (registered) return

  ipcMain.handle(IPC.SETTINGS_GET_STATE, () => getState())

  ipcMain.on(IPC.SETTINGS_SET_LAUNCH_AT_LOGIN, (_event, enabled: boolean) => {
    setLaunchAtLogin(enabled)
  })

  ipcMain.on(IPC.SETTINGS_SET_SHORTCUTS_PAUSED, (_event, paused: boolean) => {
    setShortcutsPaused(paused)
  })

  ipcMain.on(IPC.SETTINGS_SET_SHORTCUT_ENABLED, (_event, id: ShortcutActionId, enabled: boolean) => {
    setShortcutEnabled(id, enabled)
  })

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUT, (_event, id: ShortcutActionId, accelerator: string) =>
    trySetShortcut(id, accelerator)
  )

  ipcMain.on(IPC.SETTINGS_OPEN_KEYBOARD_SETTINGS, () => {
    // BUILD-SPEC.md §4.6: "Take over the system screenshot shortcuts" points
    // the user at Apple's own Keyboard Shortcuts pane to disable ⌘⇧3/4/5
    // themselves — this app has no API to do that for them.
    shell.openExternal('x-apple.systempreferences:com.apple.preference.keyboard?Shortcuts').catch((err: unknown) => {
      notifyFailure(
        "Couldn't open System Settings",
        'Open System Settings → Keyboard → Shortcuts manually to disable ⌘⇧3/4/5.',
        err
      )
    })
  })

  registered = true
}

export function teardownSettingsIpc(): void {
  ipcMain.removeHandler(IPC.SETTINGS_GET_STATE)
  ipcMain.removeAllListeners(IPC.SETTINGS_SET_LAUNCH_AT_LOGIN)
  ipcMain.removeAllListeners(IPC.SETTINGS_SET_SHORTCUTS_PAUSED)
  ipcMain.removeAllListeners(IPC.SETTINGS_SET_SHORTCUT_ENABLED)
  ipcMain.removeHandler(IPC.SETTINGS_SET_SHORTCUT)
  ipcMain.removeAllListeners(IPC.SETTINGS_OPEN_KEYBOARD_SETTINGS)
  registered = false
}
