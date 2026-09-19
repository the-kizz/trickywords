import { describe, it, expect } from 'vitest'
import { resolvePublicProto, DEFAULT_PUBLIC_PROTO } from '@/lib/forwarded-proto.mts'

describe('resolvePublicProto', () => {
  it('defaults to http when unset', () => {
    expect(resolvePublicProto(undefined)).toBe('http')
    expect(resolvePublicProto(null)).toBe('http')
    expect(resolvePublicProto('')).toBe('http')
    expect(DEFAULT_PUBLIC_PROTO).toBe('http')
  })

  it('accepts https', () => {
    expect(resolvePublicProto('https')).toBe('https')
  })

  it('trims whitespace and lower-cases before matching', () => {
    expect(resolvePublicProto('HTTPS ')).toBe('https')
    expect(resolvePublicProto('  http  ')).toBe('http')
    expect(resolvePublicProto('Https')).toBe('https')
  })

  it('falls back to http on any invalid value, never forwarding it verbatim', () => {
    expect(resolvePublicProto('httpss')).toBe('http')
    expect(resolvePublicProto('ftp')).toBe('http')
    expect(resolvePublicProto('http; evil')).toBe('http')
  })
})
