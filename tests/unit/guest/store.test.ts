import { describe, it, expect, beforeEach } from 'vitest'
import { loadGuest, saveGuest, clearGuest, GUEST_KEY } from '@/lib/guest/store'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

describe('guest store', () => {
  it('uses sessionStorage, not localStorage or cookies', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1 })
    expect(sessionStorage.getItem(GUEST_KEY)).not.toBeNull()
    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
    expect(document.cookie).not.toContain('trickywords')
  })

  it('returns a fresh state when nothing is stored', () => {
    const s = loadGuest()
    expect(s.avatar).toBeNull()
    expect(s.progress).toEqual({})
  })

  it('round-trips guest progress', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveGuest({ avatar: 'owl', progress: { said: p }, bestKnown: 2, lastSetId: null, schoolSetId: null, startedAt: 5 })
    const s = loadGuest()
    expect(s.avatar).toBe('owl')
    expect(s.progress.said).toEqual(p)
    expect(s.bestKnown).toBe(2)
  })

  it('clears everything for the next child on a shared device', () => {
    saveGuest({ avatar: 'bee', progress: { a: newProgress('a') }, bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1 })
    clearGuest()
    expect(loadGuest().avatar).toBeNull()
    expect(sessionStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('recovers from corrupt stored data rather than crashing mid-game', () => {
    sessionStorage.setItem(GUEST_KEY, '{not json')
    expect(() => loadGuest()).not.toThrow()
    expect(loadGuest().avatar).toBeNull()
  })

  it('survives a refresh, because sessionStorage persists per tab', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1 })
    // A refresh re-runs module code but does not clear sessionStorage.
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
    sessionStorage.setItem(GUEST_KEY, JSON.stringify({
      avatar: 'fox', progress: { the: p }, lastSetId: null, schoolSetId: null, startedAt: 1,
    }))
    expect(loadGuest().bestKnown).toBe(1)
  })

  it('keeps a stored mark that is higher than what is known now', () => {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify({
      avatar: 'fox', progress: {}, bestKnown: 9, lastSetId: null, schoolSetId: null, startedAt: 1,
    }))
    expect(loadGuest().bestKnown).toBe(9)
  })
})
