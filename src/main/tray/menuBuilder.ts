import { Menu, app, type MenuItemConstructorOptions } from 'electron'

export interface TrayMenuHandlers {
  onCaptureArea: () => void
  onCaptureFullScreen: () => void
  onOpenSaveFolder: () => void
}

export function buildTrayMenu(handlers: TrayMenuHandlers): Menu {
  const template: MenuItemConstructorOptions[] = [
    { label: 'Capture Area', click: handlers.onCaptureArea },
    { label: 'Capture Full Screen', click: handlers.onCaptureFullScreen },
    { type: 'separator' },
    { label: 'Open Save Folder', click: handlers.onOpenSaveFolder },
    { type: 'separator' },
    { label: 'Settings…', enabled: false },
    { label: 'Pause Shortcuts', enabled: false },
    { type: 'separator' },
    { label: 'About / Check for Updates', enabled: false },
    { label: 'Quit', click: () => app.quit() }
  ]
  return Menu.buildFromTemplate(template)
}
