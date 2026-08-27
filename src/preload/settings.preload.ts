import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { SettingsState, ShortcutActionId } from '../shared/types'

contextBridge.exposeInMainWorld('settingsApi', {
  getState: (): Promise<SettingsState> => ipcRenderer.invoke(IPC.SETTINGS_GET_STATE),
  setLaunchAtLogin: (enabled: boolean): void => ipcRenderer.send(IPC.SETTINGS_SET_LAUNCH_AT_LOGIN, enabled),
  setShortcutsPaused: (paused: boolean): void => ipcRenderer.send(IPC.SETTINGS_SET_SHORTCUTS_PAUSED, paused),
  setShortcut: (id: ShortcutActionId, accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_SHORTCUT, id, accelerator),
  setSaveToDisk: (enabled: boolean): void => ipcRenderer.send(IPC.SETTINGS_SET_SAVE_TO_DISK, enabled),
  chooseSaveFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.SETTINGS_CHOOSE_SAVE_FOLDER),
  openKeyboardSettings: (): void => ipcRenderer.send(IPC.SETTINGS_OPEN_KEYBOARD_SETTINGS)
})
