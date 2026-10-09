import { describe, it, expect } from 'vitest'
import { resolveMode } from '@/lib/mode'

describe('resolveMode', () => {
  it('defaults to family when unset', () => {
    expect(resolveMode({})).toBe('family')
  })

  it('reads public mode from the env var', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: 'public' })).toBe('public')
  })

  it('ignores case and surrounding whitespace', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: '  PUBLIC ' })).toBe('public')
  })

  it('fails closed to family on an unrecognised value', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: 'publik' })).toBe('family')
    expect(resolveMode({ TRICKYWORDS_MODE: '' })).toBe('family')
  })
})
