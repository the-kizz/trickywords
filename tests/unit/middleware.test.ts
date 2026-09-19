// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { PUBLIC_ENTRY_PATH, SURFACE_HEADER } from '@/lib/public-surface.mts'

/**
 * The app-level guard: the second of the two layers protecting the
 * public surface. The first is the listener allowlist
 * (`tests/unit/public-surface.test.ts`), which already 404s these paths
 * before they reach Next — this proves the app would still refuse them
 * if that layer ever failed.
 */

const FAMILY_PATHS = [
  // The two routes that render a child's *name*. `/` is handled
  // separately below, because it is redirected rather than 404'd.
  '/play/1',
  '/play/42',
  '/play/1/anything',
  '/parent',
  '/parent/anything',
  '/api/parent',
  '/api/parent/voice',
  '/api/parent/voice/said',
  '/api/progress',
  '/api/profiles',
]

const PUBLIC_PATHS = ['/play', '/api/health']

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers })
}

afterEach(() => {
  delete process.env.TRICKYWORDS_MODE
})

describe('middleware — the surface header marks a request public', () => {
  it.each(FAMILY_PATHS)('404s %s when the request carries the public surface header', async (path) => {
    const res = await middleware(request(path, { [SURFACE_HEADER]: 'public' }))
    expect(res.status).toBe(404)
  })

  it.each(FAMILY_PATHS)('lets %s through without the header, so family mode is untouched', async (path) => {
    const res = await middleware(request(path))
    expect(res.status).not.toBe(404)
  })

  it.each(PUBLIC_PATHS)('leaves the guest path %s alone with the header set', async (path) => {
    const res = await middleware(request(path, { [SURFACE_HEADER]: 'public' }))
    expect(res.status).not.toBe(404)
  })

  it('reads the header case-insensitively and ignores surrounding whitespace', async () => {
    expect((await middleware(request('/parent', { [SURFACE_HEADER]: '  PUBLIC ' }))).status).toBe(404)
    expect((await middleware(request('/parent', { 'X-TrickyWords-Surface': 'public' }))).status).toBe(404)
  })

  it('ignores any other header value, rather than guessing', async () => {
    for (const value of ['', 'family', 'publik', 'true', '1']) {
      const res = await middleware(request('/parent', { [SURFACE_HEADER]: value }))
      expect(res.status).not.toBe(404)
    }
  })

  it('cannot be used to widen access: the header only ever restricts', async () => {
    // There is no value a caller can send that unlocks a family path.
    for (const value of ['family', 'private', 'admin', 'public']) {
      const res = await middleware(
        request('/api/profiles', { [SURFACE_HEADER]: value }),
      )
      if (value === 'public') expect(res.status).toBe(404)
      else expect(res.status).not.toBe(404)
    }
  })

  it('does not treat a lookalike path as a family path', async () => {
    // Prefix matching is segment-aware: '/parenthood' is not '/parent'.
    const res = await middleware(request('/parenthood', { [SURFACE_HEADER]: 'public' }))
    expect(res.status).not.toBe(404)
  })
})

describe('middleware — the two routes that render a child name', () => {
  /**
   * These were the gap: `/` and `/play/<profileId>` are the only routes
   * that put a child's name in a response, and they used to be guarded
   * by `isPublicMode()` alone -- which is `family` in a one-container
   * deployment. The listener allowlist was the only layer for the worst
   * possible leak. Both layers now cover them.
   */
  it('404s /play/<profileId> for a public request', async () => {
    for (const path of ['/play/1', '/play/999', '/play/1/', '/play/abc']) {
      const res = await middleware(request(path, { [SURFACE_HEADER]: 'public' }))
      expect(res.status, path).toBe(404)
    }
  })

  it('still serves /play itself, which is the guest game', async () => {
    const res = await middleware(request('/play', { [SURFACE_HEADER]: 'public' }))
    expect(res.status).not.toBe(404)
    expect([301, 302, 307, 308]).not.toContain(res.status)
  })

  it('still serves /play with a query', async () => {
    const res = await middleware(request('/play?set=3', { [SURFACE_HEADER]: 'public' }))
    expect(res.status).not.toBe(404)
  })

  it('never renders the family home for a public request: / goes to the guest game', async () => {
    const res = await middleware(request('/', { [SURFACE_HEADER]: 'public' }))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe(PUBLIC_ENTRY_PATH)
  })

  it('leaves / alone for a family request', async () => {
    const res = await middleware(request('/'))
    expect(res.status).not.toBe(404)
    expect([301, 302, 307, 308]).not.toContain(res.status)
  })

  it('does not treat /playground as a child play route', async () => {
    const res = await middleware(request('/playground', { [SURFACE_HEADER]: 'public' }))
    expect(res.status).not.toBe(404)
  })
})

describe('middleware — TRICKYWORDS_MODE=public still works on its own', () => {
  it.each(FAMILY_PATHS)('404s %s with no header at all', async (path) => {
    process.env.TRICKYWORDS_MODE = 'public'
    const res = await middleware(request(path))
    expect(res.status).toBe(404)
  })

  it('leaves the guest paths alone', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    for (const path of PUBLIC_PATHS) {
      expect((await middleware(request(path))).status).not.toBe(404)
    }
  })

  it('sends / to the guest game rather than 404ing a public-only container', async () => {
    // TRICKYWORDS_MODE=public is the escape hatch SECURITY.md points at.
    // Its root has to land on the game.
    process.env.TRICKYWORDS_MODE = 'public'
    const res = await middleware(request('/'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe(PUBLIC_ENTRY_PATH)
  })
})
