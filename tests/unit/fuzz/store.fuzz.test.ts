import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadGuest, saveGuest, GUEST_KEY } from '@/lib/guest/store'
import { prng, pick, int } from './prng'

/**
 * Whatever is in localStorage -- another app's leftovers, a half-written
 * record, a record from a future version, bytes -- the guest page must
 * come up, and come up well-formed.
 */
function garbage(rng: () => number, depth = 0): unknown {
  const kinds = ['null', 'num', 'str', 'bool', 'arr', 'obj', 'nan', 'big'] as const
  const k = pick(rng, kinds)
  if (k === 'null') return null
  if (k === 'num') return int(rng, -1e9, 1e9)
  if (k === 'str') return pick(rng, ['', 'known', '{', '[]', 'x'.repeat(int(rng, 0, 5000)), '\u0000', '💥'])
  if (k === 'bool') return rng() < 0.5
  if (k === 'nan') return 'NaN'
  if (k === 'big') return 1e308
  if (depth > 2) return 0
  if (k === 'arr') return Array.from({ length: int(rng, 0, 5) }, () => garbage(rng, depth + 1))
  const o: Record<string, unknown> = {}
  for (const key of ['avatar', 'progress', 'bestKnown', 'lastSetId', 'schoolSetId', 'grownUp', 'startedAt', 'the', 'said', '__proto__', 'box', 'stage']) {
    if (rng() < 0.5) o[key] = garbage(rng, depth + 1)
  }
  return o
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('the guest store under garbage', () => {
  it('loads a well-formed state from anything, without throwing', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rng = prng(seed)
      const raw = rng() < 0.15 ? pick(rng, ['', 'null', '{', 'undefined', '[1,2', '{"progress":[1,2]}', '{"progress":{"the":null}}', '{"progress":{"the":5}}'])
        : JSON.stringify(garbage(rng))
      localStorage.setItem(GUEST_KEY, raw)
      const where = `seed ${seed}: ${raw.slice(0, 80)}`
      let state: ReturnType<typeof loadGuest> | undefined
      expect(() => { state = loadGuest() }, where).not.toThrow()
      expect(state, where).toBeDefined()
      expect(typeof state!.progress, where).toBe('object')
      expect(state!.progress, where).not.toBeNull()
      expect(Array.isArray(state!.progress), `${where}: progress is an array`).toBe(false)
      for (const [id, p] of Object.entries(state!.progress)) {
        expect(p !== null && typeof p === 'object', `${where}: progress[${id}] = ${JSON.stringify(p)}`).toBe(true)
        expect(Number.isInteger((p as { box?: unknown }).box), `${where}: progress[${id}].box = ${String((p as { box?: unknown }).box)}`).toBe(true)
      }
      expect(Number.isFinite(state!.bestKnown) && state!.bestKnown >= 0, `${where}: bestKnown ${state!.bestKnown}`).toBe(true)
      expect(state!.lastSetId === null || Number.isInteger(state!.lastSetId), where).toBe(true)
      expect(state!.schoolSetId === null || Number.isInteger(state!.schoolSetId), where).toBe(true)
      expect([null, true, false], where).toContain(state!.grownUp)
      expect(state!.avatar === null || typeof state!.avatar === 'string', where).toBe(true)
      // And what it loaded can be saved and loaded again identically.
      saveGuest(state!)
      expect(loadGuest(), `${where}: not stable over a save/load`).toEqual(state)
    }
  })

  it('survives a full device (setItem throwing) and keeps the in-memory state usable', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn(() => { throw new DOMException('quota', 'QuotaExceededError') })
    try {
      expect(() => saveGuest({ ...loadGuest(), avatar: 'fox' })).not.toThrow()
      expect(() => loadGuest()).not.toThrow()
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
