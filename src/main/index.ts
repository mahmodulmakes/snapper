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
import { initOverlayWindows, showOverlays, showOverlaysForTextCapture, teardownOverlayWindows } from './overlay/overlayManager'
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

/** Universal Text Capture's shortcut (BUILD-SPEC.md §4.9, beta track). */
function captureText(): void {
  if (!requireScreenRecording()) return
  showOverlaysForTextCapture().catch((err: unknown) => {
    logger.error('Could not show the text-capture overlay.', err)
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
  onCaptureText: captureText,
  onOpenSaveFolder: openSaveFolder,
  onOpenSettings: showSettingsWindow,
  onTogglePauseShortcuts: togglePauseShortcuts
}

function currentTrayState(): TrayMenuState {
  const store = getSettingsStore()
  return {
    shortcuts: store.get('shortcuts'),
    shortcutsPaused: store.get('shortcutsPaused')
  }
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  // A menu-bar app has no Dock icon or window to focus, so a user who
  // double-clicks Snapper again while it's already running (not realizing
  // that, or just wanting to get to it) would otherwise see literally
  // nothing happen. Show Settings as the concrete "yes, I'm running" signal.
  //
  // Both events, deliberately: Electron's docs describe macOS as enforcing
  // single-instance for a Finder/Launchpad re-launch through its OWN native
  // mechanism (distinct from second-instance, which is oriented at
  // command-line re-invocation) — unclear from the docs alone which one
  // actually fires for a GUI double-click on an app with no Dock icon, so
  // both are handled rather than guessing. Harmless if both fire for the
  // same click — showSettingsWindow() just focuses the existing window.
  app.on('second-instance', () => {
    logger.info('Second launch attempt while already running (second-instance); showing Settings.')
    showSettingsWindow()
  })
  app.on('activate', (_event, hasVisibleWindows) => {
    // hasVisibleWindows is exactly the guard Electron's own docs recommend
    // for this event, and it's essential here: 'activate' fires for far
    // more than "user reopened the app" — showing/focusing the capture
    // overlay on a hotkey press also counts, and without this check every
    // capture would spuriously pop Settings open alongside the overlay.
    if (hasVisibleWindows) return
    logger.info('App activated while already running with no visible windows (activate); showing Settings.')
    showSettingsWindow()
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
    initShortcuts({ captureArea, captureFullScreen, captureText })
    onShortcutStateChange(() => updateTrayMenu(trayHandlers, currentTrayState()))
    if (!isScreenRecordingGranted()) {
      showOnboardingWindow()
    } else if (!app.getLoginItemSettings().wasOpenedAtLogin) {
      // Same "clicking the app should visibly do something" reasoning as the
      // second-instance handler below, for the case where this is the FIRST
      // instance: a manual launch (Finder double-click, Launchpad, Spotlight)
      // with permission already granted otherwise shows nothing at all.
      // wasOpenedAtLogin distinguishes that from the every-boot launch-at-login
      // case, which must stay silent — nobody wants Settings popping up at
      // every login.
      showSettingsWindow()
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
