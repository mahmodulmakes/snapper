import { Tray, nativeImage } from 'electron'
import { buildTrayMenu, type TrayMenuHandlers } from './menuBuilder'

let tray: Tray | null = null

// 1x1 transparent placeholder; swap for a proper monochrome template icon
// (see BUILD-SPEC.md §4.1) before shipping.
const PLACEHOLDER_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)

export function createTray(handlers: TrayMenuHandlers): Tray {
  if (tray) return tray

  const icon = PLACEHOLDER_ICON
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Screenshot')
  tray.setContextMenu(buildTrayMenu(handlers))

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
