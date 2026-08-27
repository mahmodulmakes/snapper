import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { SettingsState, ShortcutActionId } from '../shared/types'

contextBridge.exposeInMainWorld('settingsApi', {
  getState: (): Promise<SettingsState> => ipcRenderer.invoke(IPC.SETTINGS_GET_STATE),
  setLaunchAtLogin: (enabled: boolean): void => ipcRenderer.send(IPC.SETTINGS_SET_LAUNCH_AT_LOGIN, enabled),
  setShortcutsPaused: (paused: boolean): void => ipcRenderer.send(IPC.SETTINGS_SET_SHORTCUTS_PAUSED, paused),
  setShortcutEnabled: (id: ShortcutActionId, enabled: boolean): void =>
    ipcRenderer.send(IPC.SETTINGS_SET_SHORTCUT_ENABLED, id, enabled),
  setShortcut: (id: ShortcutActionId, accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_SHORTCUT, id, accelerator),
  openKeyboardSettings: (): void => ipcRenderer.send(IPC.SETTINGS_OPEN_KEYBOARD_SETTINGS)
})
