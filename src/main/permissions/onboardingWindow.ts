import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../ipc/channels'
import { logger } from '../logger'
import { notifyFailure } from '../notify'
import { openScreenRecordingPrivacySettings } from './screenRecording'

const __dirname = dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null
let listenersRegistered = false

function preloadPath(): string {
  return join(__dirname, '../preload/onboarding.cjs')
}

function rendererUrl(): string {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  return devServerUrl ? `${devServerUrl}/onboarding/index.html` : join(__dirname, '../renderer/onboarding/index.html')
}

function restartApp(): void {
  app.relaunch()
  app.exit(0)
}

/** Registers the onboarding window's IPC handlers. Call once at startup. */
export function initOnboarding(): void {
  if (listenersRegistered) return
  ipcMain.on(IPC.ONBOARDING_OPEN_SETTINGS, () => {
    openScreenRecordingPrivacySettings().catch((err: unknown) => {
      // CLAUDE.md: never let a failure be silent — the user clicked a button
      // and needs to know it didn't work, not just find it in a log.
      notifyFailure(
        "Couldn't open System Settings",
        'Open System Settings → Privacy & Security → Screen Recording manually to grant access.',
        err
      )
    })
  })
  ipcMain.on(IPC.ONBOARDING_RESTART, restartApp)
  listenersRegistered = true
}

export function teardownOnboarding(): void {
  ipcMain.removeAllListeners(IPC.ONBOARDING_OPEN_SETTINGS)
  ipcMain.removeAllListeners(IPC.ONBOARDING_RESTART)
  listenersRegistered = false
  win?.close()
  win = null
}

/** Explains why Screen Recording access is needed and how to grant it (BUILD-SPEC.md §3.4). */
export function showOnboardingWindow(): void {
  if (win) {
    win.show()
    win.focus()
    return
  }

  win = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    fullscreenable: false,
    minimizable: false,
    title: 'Screen Recording Access Needed',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath()
    }
  })

  const url = rendererUrl()
  const loaded = url.startsWith('http') ? win.loadURL(url) : win.loadFile(url)
  loaded.catch((err: unknown) => {
    logger.error('Onboarding window failed to load its renderer.', err)
  })

  win.on('closed', () => {
    win = null
  })
}
