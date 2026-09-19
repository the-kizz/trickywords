import { describe, it, expect } from 'vitest'
import { resolveSiteUrl } from '@/lib/site-url'

describe('resolveSiteUrl', () => {
  it('is undefined when unset, so the app works with no domain configured', () => {
    expect(resolveSiteUrl({})).toBeUndefined()
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: undefined })).toBeUndefined()
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: '' })).toBeUndefined()
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: '   ' })).toBeUndefined()
  })

  it('parses a valid absolute https URL', () => {
    const url = resolveSiteUrl({ TRICKYWORDS_SITE_URL: 'https://words.example.org' })
    expect(url).toBeInstanceOf(URL)
    expect(url?.toString()).toBe('https://words.example.org/')
  })

  it('parses a valid absolute http URL', () => {
    const url = resolveSiteUrl({ TRICKYWORDS_SITE_URL: 'http://192.0.2.1:3001' })
    expect(url?.protocol).toBe('http:')
  })

  it('falls back to undefined on a malformed value rather than throwing', () => {
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: 'not a url' })).toBeUndefined()
  })

  it('falls back to undefined on a non-http(s) scheme', () => {
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: 'ftp://example.org' })).toBeUndefined()
    expect(resolveSiteUrl({ TRICKYWORDS_SITE_URL: 'javascript:alert(1)' })).toBeUndefined()
  })
})
