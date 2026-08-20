import { app, screen, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { captureRectAndOutput } from './capture/captureService'
import { defaultSaveDirectory } from './output/fileWriter'
import { createTray, destroyTray } from './tray/trayManager'
import { initOverlayWindows, showOverlays, teardownOverlayWindows } from './overlay/overlayManager'
import { logger } from './logger'

const gotSingleInstanceLock = app.requestSingleInstanceLock()

function captureFullScreen(): void {
  const { bounds } = screen.getPrimaryDisplay()
  captureRectAndOutput({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }).catch(
    (err: unknown) => {
      logger.error('Full-screen capture failed unexpectedly.', err)
    }
  )
}

function openSaveFolder(): void {
  const dir = defaultSaveDirectory()
  mkdir(dir, { recursive: true })
    .then(() => shell.openPath(dir))
    .then((err) => {
      if (err) logger.error(`Could not open save folder: ${err}`)
    })
    .catch((err: unknown) => {
      logger.error('Could not open save folder.', err)
    })
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Menu-bar app has no window to focus; the tray icon is the entry point.
    logger.info('Second instance attempted; ignoring (single-instance lock held).')
  })

  // Menu-bar utility: never show a Dock icon or appear in the app switcher.
  // LSUIElement in Info.plist (via electron-builder extendInfo) covers the
  // packaged app; dock.hide() covers development runs.
  app.dock?.hide()

  app.whenReady().then(() => {
    createTray({
      onCaptureArea: showOverlays,
      onCaptureFullScreen: captureFullScreen,
      onOpenSaveFolder: openSaveFolder
    })
    initOverlayWindows()
    logger.info('App ready; tray created, overlay window pool pre-warmed.')
  })

  app.on('window-all-closed', () => {
    // No-op: a menu-bar app has no primary window whose closing should quit it.
  })

  app.on('before-quit', () => {
    destroyTray()
    teardownOverlayWindows()
  })
}
