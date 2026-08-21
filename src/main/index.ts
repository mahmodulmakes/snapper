import { app, screen, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { captureRectAndOutput } from './capture/captureService'
import { defaultSaveDirectory } from './output/fileWriter'
import { initOnboarding, showOnboardingWindow, teardownOnboarding } from './permissions/onboardingWindow'
import { isScreenRecordingGranted } from './permissions/screenRecording'
import { initSettingsIpc, teardownSettingsIpc } from './settings/settingsIpc'
import { showSettingsWindow, closeSettingsWindow } from './settings/settingsWindow'
import { syncLaunchAtLogin } from './settings/launchAtLogin'
import { getSettingsStore } from './settings/store'
import { initShortcuts, onShortcutStateChange, setShortcutsPaused, teardownShortcuts } from './shortcuts/shortcutManager'
import { createTray, destroyTray, updateTrayMenu } from './tray/trayManager'
import { initOverlayWindows, showOverlays, teardownOverlayWindows } from './overlay/overlayManager'
import { logger } from './logger'
import { notifyFailure } from './notify'
import type { TrayMenuHandlers, TrayMenuState } from './tray/menuBuilder'

const gotSingleInstanceLock = app.requestSingleInstanceLock()

/** Gate for any action that needs Screen Recording access — steers to onboarding instead of a doomed capture. */
function requireScreenRecording(): boolean {
  if (isScreenRecordingGranted()) return true
  showOnboardingWindow()
  return false
}

function captureArea(): void {
  if (!requireScreenRecording()) return
  showOverlays().catch((err: unknown) => {
    logger.error('Could not show the capture overlay.', err)
  })
}

function captureFullScreen(): void {
  if (!requireScreenRecording()) return
  // Capture whichever display the pointer is on, not always the primary
  // (CleanShot X/Shottr convention) — multi-monitor users expect ⌃⇧3 to
  // follow the cursor.
  const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
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
      if (err) notifyFailure("Couldn't open Screenshots folder", `Could not open save folder: ${err}`)
    })
    .catch((err: unknown) => {
      notifyFailure("Couldn't open Screenshots folder", `Could not open save folder: ${String(err)}`)
    })
}

function togglePauseShortcuts(): void {
  setShortcutsPaused(!getSettingsStore().get('shortcutsPaused'))
}

const trayHandlers: TrayMenuHandlers = {
  onCaptureArea: captureArea,
  onCaptureFullScreen: captureFullScreen,
  onOpenSaveFolder: openSaveFolder,
  onOpenSettings: showSettingsWindow,
  onTogglePauseShortcuts: togglePauseShortcuts
}

function currentTrayState(): TrayMenuState {
  const store = getSettingsStore()
  return { shortcuts: store.get('shortcuts'), shortcutsPaused: store.get('shortcutsPaused') }
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
    createTray(trayHandlers, currentTrayState())
    initOverlayWindows()
    initOnboarding()
    initSettingsIpc()
    syncLaunchAtLogin()
    initShortcuts({ captureArea, captureFullScreen })
    onShortcutStateChange(() => updateTrayMenu(trayHandlers, currentTrayState()))
    if (!isScreenRecordingGranted()) {
      showOnboardingWindow()
    }
    logger.info('App ready; tray created, overlay window pool pre-warmed.')
  })

  app.on('window-all-closed', () => {
    // No-op: a menu-bar app has no primary window whose closing should quit it.
  })

  app.on('before-quit', () => {
    destroyTray()
    teardownOverlayWindows()
    teardownOnboarding()
    teardownSettingsIpc()
    teardownShortcuts()
    closeSettingsWindow()
  })
}
