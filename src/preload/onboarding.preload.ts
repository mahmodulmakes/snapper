import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'

contextBridge.exposeInMainWorld('onboardingApi', {
  openSettings: (): void => ipcRenderer.send(IPC.ONBOARDING_OPEN_SETTINGS),
  restart: (): void => ipcRenderer.send(IPC.ONBOARDING_RESTART)
})
