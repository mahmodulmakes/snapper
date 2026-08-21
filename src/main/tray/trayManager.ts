import { Tray, nativeImage } from 'electron'
import { buildTrayMenu, type TrayMenuHandlers, type TrayMenuState } from './menuBuilder'

let tray: Tray | null = null

// Monochrome template image (BUILD-SPEC.md §4.1) — crop-corners/viewfinder
// glyph matching build/icon.png's motif, black-on-transparent so macOS can
// auto-tint it for light/dark menu bars and the menu-open highlight state.
// Source is 88x88px, resized to a 22x22pt logical size below — plenty of
// backing resolution for a crisp @2x Retina render.
const TRAY_ICON_SOURCE = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFgAAABYCAYAAABxlTA0AAACaklEQVR4nOzcPS8lYRwF8LP2vdjdal8Ku9vsFqKjQ0hEoUKiVal8ApXWRxDfQCs6hUiITqMRlcJL4aVTiJeC88ToxDUzzzF/cn7JyQ25JveePJmZ+59r2mBSbTApFyzmgsVcsJgLFnPBYi5Y7N0TnnMDjTd4Xo28D69gMRcs5oLFXLCYCxZzwWIuWOwp58GtPPf5bFVVX2et82evYDEXLOaCxVywmAsWc8FiLljMBYu5YDEXLOaCxVywmAsWeymTsBfLK1jMBYvlGLgr/WVGmX6mg/ld/P6A2WHWmCVmH0FF3Qd/Z2aYKeZDi+deMfPMLHOKYCIW3M4sM50oZ5sZZg4RSLSCU6mp3HZUk8pNJW8jiEgFv2dWmT7Us84MMdcI4C3imGYmUV86MJ4zGwggygpOB7Vd5gvyOGP+IcBBL8p58DjylZt8LbbZuCgFjyG/YQQQZRdxxPxEXsfMLzQsSsEXzEfkdcl8QsM8ixCLUvAR8lNss7QoBW8hP8U2S4tS8DLyU2yztCgHuW/MXvGYwwnzH3cfOBoV5aPyZfE4hDzSqHMNAUQb9qzgbrheR5pBDCLIsCfauPIHs8n8QTXpSkc3Ag3eo50Hp31nL6rNc9Pf9CDYVY1I48p76cC0wHxmutD6NaZLRnPMBHzJqLQ02x1hBvDwRc80XF8sfg7JXzwR8yxCzAWL5bjjyWvfzdR6/17BYi5YzAWLuWAxFyzmgsVcsJgLFnPBYi5YzAWLuWAxFyyW49+4qt5X7LXcP/hRXsFiLljMBYu5YDEXLOaCxVywmL94IuYVLOaCxVywmAsWc8FiLljMBYvdAgAA///YHg5PAAAABklEQVQDAAdjQrRvZ3y8AAAAAElFTkSuQmCC'
)

export function createTray(handlers: TrayMenuHandlers, state: TrayMenuState): Tray {
  if (tray) return tray

  const icon = TRAY_ICON_SOURCE.resize({ width: 22, height: 22 })
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Snapper')
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
