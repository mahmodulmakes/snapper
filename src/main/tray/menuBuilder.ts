import { Menu, app, type MenuItemConstructorOptions } from 'electron'

export function buildTrayMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    { label: 'Capture Area', enabled: false },
    { label: 'Capture Full Screen', enabled: false },
    { label: 'Capture Window', enabled: false },
    { label: 'Scrolling Capture', enabled: false },
    { type: 'separator' },
    { label: 'Open Save Folder', enabled: false },
    { type: 'separator' },
    { label: 'Settings…', enabled: false },
    { label: 'Pause Shortcuts', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]
  return Menu.buildFromTemplate(template)
}
