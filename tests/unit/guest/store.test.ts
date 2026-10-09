import { describe, it, expect } from 'vitest'
import { loadGuest, saveGuest, clearGuest, GUEST_KEY } from '@/lib/guest/store'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'

const record = (over: Partial<Parameters<typeof saveGuest>[0]> = {}) => ({
  avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null,
  grownUp: null, startedAt: 1, ...over,
})

describe('guest store', () => {
  /**
   * localStorage, so the record outlives the tab. It used to be
   * sessionStorage, and on the public page -- the one actually used --
   * that meant every visit started every word at box 0. Never a cookie:
   * nothing here is sent anywhere.
   */
  it('uses localStorage, and never a cookie', () => {
    saveGuest(record())
    expect(localStorage.getItem(GUEST_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(GUEST_KEY)).toBeNull()
    expect(document.cookie).not.toContain('trickywords')
  })

  it('returns a fresh state when nothing is stored', () => {
    const s = loadGuest()
    expect(s.avatar).toBeNull()
    expect(s.progress).toEqual({})
  })

  it('round-trips guest progress', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveGuest(record({ avatar: 'owl', progress: { said: p }, bestKnown: 2, startedAt: 5 }))
    const s = loadGuest()
    expect(s.avatar).toBe('owl')
    expect(s.progress.said).toEqual(p)
    expect(s.bestKnown).toBe(2)
  })

  it('clears everything for the next child on a shared device', () => {
    saveGuest(record({ avatar: 'bee', progress: { a: newProgress('a') } }))
    clearGuest()
    expect(loadGuest().avatar).toBeNull()
    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('recovers from corrupt stored data rather than crashing mid-game', () => {
    localStorage.setItem(GUEST_KEY, '{not json')
    expect(() => loadGuest()).not.toThrow()
    expect(loadGuest().avatar).toBeNull()
  })

  /**
   * The point of the change: what was learned is still there tomorrow.
   * jsdom's localStorage persists across a simulated reload exactly as
   * a browser's does across closing the tab.
   */
  it('keeps the record after the tab is closed and reopened', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveGuest(record({ progress: { said: p } }))
    expect(loadGuest().progress.said).toEqual(p)
  })

  /**
   * A tab open across the upgrade still holds its game in
   * sessionStorage. It is adopted once and the old copy removed.
   */
  it('adopts a record the previous version left in sessionStorage', () => {
    const p = recordCorrect(newProgress('the'), false)
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(record({ avatar: 'cat', progress: { the: p } })))
    const s = loadGuest()
    expect(s.avatar).toBe('cat')
    expect(s.progress.the).toEqual(p)
    expect(localStorage.getItem(GUEST_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('prefers the device record over a leftover session one', () => {
    saveGuest(record({ avatar: 'fox' }))
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(record({ avatar: 'owl' })))
    expect(loadGuest().avatar).toBe('fox')
  })
})

/**
 * A visit saved before the mark existed must not look as though it has
 * lost everything: it is seeded from what the record already knows.
 */
describe('the high-water mark of known words', () => {
  it('is seeded from the known words of a record that has none', () => {
    let p = newProgress('the')
    for (let i = 0; i < 5; i++) p = recordCorrect(p, false)
    expect(p.stage).toBe('known')
    localStorage.setItem(GUEST_KEY, JSON.stringify({
      avatar: 'fox', progress: { the: p }, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
    }))
    expect(loadGuest().bestKnown).toBe(1)
  })

  it('keeps a stored mark that is higher than what is known now', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify({
      avatar: 'fox', progress: {}, bestKnown: 9, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
    }))
    expect(loadGuest().bestKnown).toBe(9)
  })
})
