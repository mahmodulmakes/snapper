import { Tray, nativeImage } from 'electron'
import { buildTrayMenu, type TrayMenuHandlers, type TrayMenuState } from './menuBuilder'

let tray: Tray | null = null

// Monochrome template image (BUILD-SPEC.md §4.1) — crop-corners/viewfinder
// glyph matching build/icon.png's motif, black-on-transparent so macOS can
// auto-tint it for light/dark menu bars and the menu-open highlight state.
// Source is 88x88px, resized to a 20x20pt logical size below. Went through
// three passes on real feedback: 22pt/heavy strokes read too big and bold
// next to neighboring menu bar icons; 18pt/thin strokes swung too far the
// other way and read too small; this is the middle ground.
const TRAY_ICON_SOURCE = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFgAAABYCAYAAABxlTA0AAACZUlEQVR4nOzcv45MYRzG8cfSCAq20sgKCY0olIqde1AgEVew9+B1H0ShQOcSRqGUjISEQkgEFYVEqPB7c04l9s975v1ufrN5PsmTSGZ2Y787OXNmzmbWZKg1GcqBYQ4Mc2CYA8McGObAMAeGOTDMgWEODDuidrNxvRSxivqZj9uzqYHvqJ8iVs//azVvubMPETAHhjkwzIFhDgybchaxk2dqfJbdB3fVZhbbVCe9A8/Fn3a1KmpT1DGwDxEwB4Y5MMyBYQ4Mc2CYA8McGObAMAeGOTDskAzlRzDMgWG9364k1MPYmdiFcdWb2NvYx9gfJZY98LnYk9iVbW5/Ebsee6ekMh8ibsUW2j6uxtsW431TynoWcSP2SG1uxh4rmYyBT8dex06qzbfYpdhnJZLxEPFA7XGrU7F7SibbI3gj9l7LORv7oCSyPYIvankbSuQgBu7xPbrJdh78SwdMtsALLa/H9+gm25Pcsdh3TT90/Y4dj/1UEtmOwT9iDzVd/do0cauMLzTWNbyRs972ZfoUuxz7qkQyvtCogbbUbkvJ4laHldOr2EsNf+V4Ypf7fondjj1VQlkDV/U93/rStz5pnY8d/ef2+t7D/dg1Db+MlFbpmlx9AXF1/PdzDb+A9HzRE+ZrcjAHhk0JXDRcaPzfilZfUcefz49gmAPDHBjmwDAHhjkwzIFhDgxzYJgDwxwY1vuy/UzTPp+BVNRmpo56B95U+4dZFLF6f25aEx8iYA4Mc2CYA8McGDblLGKu1dL6uWk7mauRL9vDfIiAOTDMgWEODHNgmAPDHBjmwDAHhjkwzIFhfwEAAP//o2qdywAAAAZJREFUAwB700oiWmUh8QAAAABJRU5ErkJggg=='
)

export function createTray(handlers: TrayMenuHandlers, state: TrayMenuState): Tray {
  if (tray) return tray

  const icon = TRAY_ICON_SOURCE.resize({ width: 20, height: 20 })
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
