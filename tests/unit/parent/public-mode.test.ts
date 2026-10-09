import { describe, it, expect, afterEach } from 'vitest'
import ParentPage from '@/app/parent/page'
import { GET as parentGet, POST as parentPost } from '@/app/api/parent/route'
import { GET as voiceListGet } from '@/app/api/parent/voice/route'
import * as wordVoice from '@/app/api/parent/voice/[wordId]/route'

/**
 * The parent area must not exist on a public deployment.
 *
 * Every route is imported once, at the top, rather than dynamically inside
 * each test. `isPublicMode()` reads `process.env` when it is called, not
 * when its module loads, so setting the variable before the call is enough
 * and the import can happen whenever. Importing inside a test instead put
 * the whole drizzle and better-sqlite3 chain inside a timed assertion,
 * which failed intermittently under load -- a flaky test on the one
 * boundary nobody should learn to ignore.
 */
afterEach(() => {
  delete process.env.TRICKYWORDS_MODE
})

describe('parent area in public mode', () => {
  it('the /parent page calls notFound() immediately', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    await expect(ParentPage()).rejects.toThrow()
  })

  it('GET /api/parent returns 404', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    expect((await parentGet()).status).toBe(404)
  })

  it('POST /api/parent returns 404 without touching the database', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    const req = new Request('http://localhost/api/parent', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify-pin', pin: '0000' }),
    })
    expect((await parentPost(req)).status).toBe(404)
  })

  it('the voice list route returns 404', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    expect((await voiceListGet()).status).toBe(404)
  })

  it('the per-word voice route returns 404 for GET/POST/DELETE', async () => {
    process.env.TRICKYWORDS_MODE = 'public'
    const params = Promise.resolve({ wordId: 'said' })
    expect((await wordVoice.GET(new Request('http://localhost'), { params })).status).toBe(404)
    expect((await wordVoice.POST(
      new Request('http://localhost', { method: 'POST', body: new Uint8Array([1]) }),
      { params },
    )).status).toBe(404)
    expect((await wordVoice.DELETE(new Request('http://localhost'), { params })).status).toBe(404)
  })
})
