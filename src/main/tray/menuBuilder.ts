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
  shortcutsEnabled: Record<ShortcutActionId, boolean>
  shortcutsPaused: boolean
}

export function buildTrayMenu(handlers: TrayMenuHandlers, state: TrayMenuState): Menu {
  const template: MenuItemConstructorOptions[] = [
    { label: 'Capture Area', accelerator: state.shortcuts.captureArea, click: handlers.onCaptureArea },
    {
      label: 'Capture Full Screen',
      accelerator: state.shortcuts.captureFullScreen,
      click: handlers.onCaptureFullScreen
    },
    // Omitted entirely rather than shown disabled/grayed — the menu is
    // already fully rebuilt on every state change (updateTrayMenu), so
    // there's no simpler-disabled-state to preserve by keeping the row.
    ...(state.shortcutsEnabled.captureText
      ? [{ label: 'Capture Text', accelerator: state.shortcuts.captureText, click: handlers.onCaptureText }]
      : []),
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
