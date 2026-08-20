import { describe, expect, it } from 'vitest'
import { IPC } from '../../src/main/ipc/channels'

describe('IPC channels', () => {
  it('has no duplicate channel names', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
  })
})
