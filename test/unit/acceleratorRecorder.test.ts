import { describe, expect, it } from 'vitest'
import { buildAccelerator, formatAcceleratorForDisplay, normalizeKeyName } from '../../src/renderer/settings/acceleratorRecorder'

describe('normalizeKeyName', () => {
  it('returns null for bare modifier keys (still waiting for the real key)', () => {
    expect(normalizeKeyName('Shift')).toBeNull()
    expect(normalizeKeyName('Control')).toBeNull()
    expect(normalizeKeyName('Alt')).toBeNull()
    expect(normalizeKeyName('Meta')).toBeNull()
  })

  it('uppercases single-character keys', () => {
    expect(normalizeKeyName('4')).toBe('4')
    expect(normalizeKeyName('a')).toBe('A')
  })

  it('maps special keys to their accelerator names', () => {
    expect(normalizeKeyName('ArrowUp')).toBe('Up')
    expect(normalizeKeyName(' ')).toBe('Space')
    expect(normalizeKeyName('Enter')).toBe('Return')
  })

  it('passes through function keys unchanged', () => {
    expect(normalizeKeyName('F1')).toBe('F1')
  })
})

describe('buildAccelerator', () => {
  it('matches the default Capture Area binding for Control+Shift+4', () => {
    const result = buildAccelerator({ meta: false, control: true, alt: false, shift: true }, '4')
    expect(result).toEqual({ status: 'ok', accelerator: 'Control+Shift+4' })
  })

  it('returns pending while only a modifier has been pressed', () => {
    const result = buildAccelerator({ meta: false, control: true, alt: false, shift: false }, 'Control')
    expect(result).toEqual({ status: 'pending' })
  })

  it('rejects a key with no modifiers held', () => {
    const result = buildAccelerator({ meta: false, control: false, alt: false, shift: false }, '4')
    expect(result.status).toBe('error')
  })

  it('orders modifiers Command, Control, Alt, Shift regardless of press order', () => {
    const result = buildAccelerator({ meta: true, control: true, alt: true, shift: true }, 'a')
    expect(result).toEqual({ status: 'ok', accelerator: 'Command+Control+Alt+Shift+A' })
  })
})

describe('formatAcceleratorForDisplay', () => {
  it('renders the default Capture Area binding as symbols', () => {
    expect(formatAcceleratorForDisplay('Control+Shift+4')).toBe('⌃⇧4')
  })

  it('leaves unrecognized parts as-is', () => {
    expect(formatAcceleratorForDisplay('Control+F1')).toBe('⌃F1')
  })
})
