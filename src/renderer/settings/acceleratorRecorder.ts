export interface ModifierState {
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

export type RecordResult =
  | { status: 'pending' } // still waiting for a non-modifier key
  | { status: 'error'; message: string }
  | { status: 'ok'; accelerator: string }

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

const KEY_NAME_MAP: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Escape',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete'
}

/** Electron accelerator key name for a `KeyboardEvent.key` value, or null while only a modifier is held. */
export function normalizeKeyName(key: string): string | null {
  if (MODIFIER_KEYS.has(key)) return null
  const mapped = KEY_NAME_MAP[key]
  if (mapped) return mapped
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** Builds an Electron accelerator string from held modifiers + the key that completed the chord. */
export function buildAccelerator(mods: ModifierState, key: string): RecordResult {
  const normalizedKey = normalizeKeyName(key)
  if (normalizedKey === null) return { status: 'pending' }

  const parts: string[] = []
  if (mods.meta) parts.push('Command')
  if (mods.control) parts.push('Control')
  if (mods.alt) parts.push('Alt')
  if (mods.shift) parts.push('Shift')

  if (parts.length === 0) {
    return { status: 'error', message: 'Include at least one modifier key (⌃, ⌥, ⇧, or ⌘).' }
  }

  parts.push(normalizedKey)
  return { status: 'ok', accelerator: parts.join('+') }
}

const DISPLAY_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧'
}

/** "Control+Shift+4" -> "⌃⇧4", for display only — never sent back over IPC. */
export function formatAcceleratorForDisplay(accelerator: string): string {
  // Belt-and-suspenders: store.ts validates every shortcut is a real string
  // before it ever reaches the renderer, but this is the one place a bad
  // value would otherwise crash the whole Settings window (React unmounts
  // the entire tree on an uncaught render error, with no boundary here) —
  // showing "?" instead is a display glitch, not a blank window.
  if (typeof accelerator !== 'string' || accelerator === '') return '?'
  return accelerator
    .split('+')
    .map((part) => DISPLAY_SYMBOLS[part] ?? part)
    .join('')
}
