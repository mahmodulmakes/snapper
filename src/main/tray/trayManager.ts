import { Tray, nativeImage } from 'electron'
import { buildTrayMenu, type TrayMenuHandlers, type TrayMenuState } from './menuBuilder'

let tray: Tray | null = null

// 1x1 transparent placeholder; swap for a proper monochrome template icon
// (see BUILD-SPEC.md §4.1) before shipping.
const PLACEHOLDER_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)

export function createTray(handlers: TrayMenuHandlers, state: TrayMenuState): Tray {
  if (tray) return tray

  const icon = PLACEHOLDER_ICON
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Screenshot')
  tray.setContextMenu(buildTrayMenu(handlers, state))

  return tray
}

/** Rebuilds the context menu — call whenever shortcut bindings or pause state change. */
export function updateTrayMenu(handlers: TrayMenuHandlers, state: TrayMenuState): void {
  tray?.setContextMenu(buildTrayMenu(handlers, state))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
