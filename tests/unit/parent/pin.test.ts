import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin } from '@/lib/parent/pin'

describe('parent PIN', () => {
  it('never stores the PIN in clear text', () => {
    const hash = hashPin('1234')
    expect(hash).not.toContain('1234')
    expect(hash.length).toBeGreaterThan(20)
  })

  it('verifies the right PIN', () => {
    expect(verifyPin('1234', hashPin('1234'))).toBe(true)
  })

  it('rejects the wrong PIN', () => {
    expect(verifyPin('9999', hashPin('1234'))).toBe(false)
  })

  it('salts, so the same PIN does not produce the same hash twice', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'))
  })

  it('rejects a malformed stored value rather than throwing', () => {
    expect(verifyPin('1234', 'not-a-hash')).toBe(false)
  })

  it('rejects a non-numeric or short PIN when it is set', () => {
    expect(() => hashPin('12')).toThrow()
    expect(() => hashPin('abcd')).toThrow()
  })
})
