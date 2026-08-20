import { Menu, app, type MenuItemConstructorOptions } from 'electron'

export function buildTrayMenu(onCaptureArea: () => void): Menu {
  const template: MenuItemConstructorOptions[] = [
    { label: 'Capture Area', click: onCaptureArea },
    { label: 'Capture Full Screen', enabled: false },
    { type: 'separator' },
    { label: 'Open Save Folder', enabled: false },
    { type: 'separator' },
    { label: 'Settings…', enabled: false },
    { label: 'Pause Shortcuts', enabled: false },
    { type: 'separator' },
    { label: 'About / Check for Updates', enabled: false },
    { label: 'Quit', click: () => app.quit() }
  ]
  return Menu.buildFromTemplate(template)
}
