import { dialog, ipcMain, shell } from 'electron'
import { IPC } from '../ipc/channels'
import { notifyFailure } from '../notify'
import { setLaunchAtLogin } from './launchAtLogin'
import { getSettingsStore } from './store'
import { getSettingsWindowHandle } from './settingsWindow'
import { isShortcutConflicted, setShortcutsPaused, trySetShortcut } from '../shortcuts/shortcutManager'
import type { SettingsState, ShortcutActionId } from '../../shared/types'

let registered = false

function getState(): SettingsState {
  const store = getSettingsStore()
  const shortcuts = store.get('shortcuts')
  const shortcutConflicts = Object.fromEntries(
    (Object.keys(shortcuts) as ShortcutActionId[]).map((id) => [id, isShortcutConflicted(id)])
  ) as Record<ShortcutActionId, boolean>
  return {
    launchAtLogin: store.get('launchAtLogin'),
    shortcuts,
    shortcutsPaused: store.get('shortcutsPaused'),
    shortcutConflicts,
    saveToDisk: store.get('saveToDisk'),
    saveDirectory: store.get('saveDirectory')
  }
}

/** Settings' "Choose…" folder picker (BUILD-SPEC.md §2.4/§4.4's fast-follow, now in scope). Returns the newly chosen path, or null if the user canceled. */
async function chooseSaveFolder(): Promise<string | null> {
  const store = getSettingsStore()
  const win = getSettingsWindowHandle()
  const result = win
    ? await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: store.get('saveDirectory')
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: store.get('saveDirectory')
      })

  if (result.canceled || result.filePaths.length === 0) return null

  const chosen = result.filePaths[0]
  if (!chosen) return null
  store.set('saveDirectory', chosen)
  return chosen
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

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUT, (_event, id: ShortcutActionId, accelerator: string) =>
    trySetShortcut(id, accelerator)
  )

  ipcMain.on(IPC.SETTINGS_SET_SAVE_TO_DISK, (_event, enabled: boolean) => {
    getSettingsStore().set('saveToDisk', enabled)
  })

  ipcMain.handle(IPC.SETTINGS_CHOOSE_SAVE_FOLDER, () => chooseSaveFolder())

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
  ipcMain.removeHandler(IPC.SETTINGS_SET_SHORTCUT)
  ipcMain.removeAllListeners(IPC.SETTINGS_SET_SAVE_TO_DISK)
  ipcMain.removeHandler(IPC.SETTINGS_CHOOSE_SAVE_FOLDER)
  ipcMain.removeAllListeners(IPC.SETTINGS_OPEN_KEYBOARD_SETTINGS)
  registered = false
}
