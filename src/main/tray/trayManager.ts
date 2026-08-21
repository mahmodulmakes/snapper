import { Tray, nativeImage } from 'electron'
import { buildTrayMenu, type TrayMenuHandlers, type TrayMenuState } from './menuBuilder'

let tray: Tray | null = null

// Monochrome template image (BUILD-SPEC.md §4.1) — crop-corners/viewfinder
// glyph matching build/icon.png's motif, black-on-transparent so macOS can
// auto-tint it for light/dark menu bars and the menu-open highlight state.
// Source is 88x88px, resized to an 18x18pt logical size below — thinner
// strokes and more padding than the first pass, which rendered noticeably
// bigger/bolder than neighboring menu bar icons.
const TRAY_ICON_SOURCE = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFgAAABYCAYAAABxlTA0AAACM0lEQVR4nOzcvYpTQRjG8cdVxEILG7/uQRsVyw0ICl6CiLfi2FqLvRbegiIIR0s/QBRvQdDCell22X2HPVVIcSZn/st74PnBWyQ7gfDnMMlOSHZkqB0ZyoFhDgxzYJgDwxwY5sAwB4Y5MMyBYQ4Mc2CYA8McGObAMAeGnVMfq3HmKOqraJ5hnFl6Bn6meYr6mvt8qkEzeYuAOTDMgWG99uBNPqnDHjbD84a1q5hdAcjAg/q/cLUojWuRwN4iYA4Mc2CYA8McGObAMAeGOTDMgWEODDsjQ/kKhjkwjDxN6+l8zK2Y2+PtbzG/YvaV3BIC3495G3Nl7f6/MU9jPiixs8rrQsyLmFcxFzf8vd73JOZSzOeYAyWU+V3Ew5j3E9c+inmnhLIGvhzzO+b6xPV/Ym7G/FcyWd9F1Kt3atzqRswDJZT1Re6a2m3zGFzWwHtqt81jcFkD/1C7bR6Dy7oHfx1nqu+N609N5rdpd2O+TFh3GHNPJ5HTyXwWUa/I1xPWvVTSuNUSjivr2683MVfX7v8X8zjmoxJbynlwPeyp/0jcGW/XK/anFnDY4wN3mM+DYQ4M6xW4xBytTdFyFEHP31cwzIFhDgxzYJgDwxwY5sAwB4Y5MMyBYeRnciu1f9uyp9KwdiUIGXhXbV9PLeqrx+9FzOYtAubAMAeG9dqDB+XT8nsRmwzqwJ/JwbxFwBwY5sAwB4Y5MMyBYQ4Mc2CYA8McGObAMAeGOTDMgWEODHNg2DEAAAD//8P70LQAAAAGSURBVAMA2pk8mIBu02UAAAAASUVORK5CYII='
)

export function createTray(handlers: TrayMenuHandlers, state: TrayMenuState): Tray {
  if (tray) return tray

  const icon = TRAY_ICON_SOURCE.resize({ width: 18, height: 18 })
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
