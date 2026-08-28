import { Menu, app, type MenuItemConstructorOptions } from 'electron'
import type { ShortcutActionId, ShortcutBindings } from '../../shared/types'

export interface TrayMenuHandlers {
  onCaptureArea: () => void
  onCaptureFullScreen: () => void
  onCaptureText: () => void
  onOpenSaveFolder: () => void
  onOpenSettings: () => void
  onTogglePauseShortcuts: () => void
}

export interface TrayMenuState {
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
  shortcutConflicts: Record<ShortcutActionId, boolean>
}

/**
 * A conflicted shortcut isn't actually live (another app owns that key
 * combination) — showing its accelerator in the native menu's keybinding
 * slot would be a flat-out lie, and the label itself needs to say so since
 * that's the only place a conflict can be surfaced in a native tray menu (no
 * icons/tooltips/color here, unlike the Settings window's version of this
 * same state).
 */
function captureMenuItem(label: string, id: ShortcutActionId, state: TrayMenuState, click: () => void): MenuItemConstructorOptions {
  if (state.shortcutConflicts[id]) {
    return { label: `${label} (shortcut unavailable)`, click }
  }
  return { label, accelerator: state.shortcuts[id], click }
}

export function buildTrayMenu(handlers: TrayMenuHandlers, state: TrayMenuState): Menu {
  const template: MenuItemConstructorOptions[] = [
    captureMenuItem('Capture Area', 'captureArea', state, handlers.onCaptureArea),
    captureMenuItem('Capture Full Screen', 'captureFullScreen', state, handlers.onCaptureFullScreen),
    captureMenuItem('Capture Text', 'captureText', state, handlers.onCaptureText),
    { type: 'separator' },
    { label: 'Open Save Folder', click: handlers.onOpenSaveFolder },
    { type: 'separator' },
    { label: 'Settings…', click: handlers.onOpenSettings },
    // Matters more than it looks — a kill switch that isn't Quit, for users
    // recording demos or playing games (BUILD-SPEC.md §4.1).
    { label: state.shortcutsPaused ? 'Resume Shortcuts' : 'Pause Shortcuts', click: handlers.onTogglePauseShortcuts },
    { type: 'separator' },
    { label: 'About / Check for Updates', enabled: false },
    { label: 'Quit', click: () => app.quit() }
  ]
  return Menu.buildFromTemplate(template)
}
