import { BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../logger'

const __dirname = dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null

function preloadPath(): string {
  return join(__dirname, '../preload/settings.cjs')
}

function rendererUrl(): string {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  return devServerUrl ? `${devServerUrl}/settings/index.html` : join(__dirname, '../renderer/settings/index.html')
}

export function showSettingsWindow(): void {
  if (win) {
    win.show()
    win.focus()
    return
  }

  win = new BrowserWindow({
    width: 520,
    height: 520,
    resizable: false,
    fullscreenable: false,
    title: 'Settings',
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
    logger.error('Settings window failed to load its renderer.', err)
  })

  win.on('closed', () => {
    win = null
  })
}

export function closeSettingsWindow(): void {
  win?.close()
}

/** Parent window for dialogs launched from Settings (e.g. the save-folder picker). */
export function getSettingsWindowHandle(): BrowserWindow | null {
  return win
}
