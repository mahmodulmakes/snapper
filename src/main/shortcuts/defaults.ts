import type { ShortcutBindings } from '../../shared/types'

/**
 * Ship on ⌃⇧ (Control-Shift), never ⌘⇧3/4/5 — those belong to macOS
 * (BUILD-SPEC.md §4.6, CLAUDE.md "things that look like good ideas and are
 * not"). Electron accelerator syntax, not a display string.
 */
export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  captureArea: 'Control+Shift+4',
  captureFullScreen: 'Control+Shift+3',
  captureText: 'Control+Shift+2'
}
