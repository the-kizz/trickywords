// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '@/app/api/health/route'
import { SURFACE_HEADER } from '@/lib/public-surface.mts'

afterEach(() => {
  delete process.env.TRICKYWORDS_MODE
})

function health(headers: Record<string, string> = {}) {
  return GET(new Request('http://localhost/api/health', { headers }))
}

describe('GET /api/health', () => {
  it('reports family mode by default', async () => {
    expect(await (await health()).json()).toMatchObject({ mode: 'family', ok: true })
  })

  it('reports the public surface for a request that arrived on the guest port', async () => {
    const body = await (await health({ [SURFACE_HEADER]: 'public' })).json()
    expect(body.mode).toBe('public')
  })

  it('still reports public mode for a public-only container', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    expect((await (await health()).json()).mode).toBe('public')
  })
})
