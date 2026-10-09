import { describe, it, expect } from 'vitest'
import { isSetComplete, isSetFullyKnown, UNLOCK_THRESHOLD } from '@/lib/engine/unlock'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

const set1 = DEFAULT_SETS[0].words // 5 words

function withKnown(n: number) {
  const m = new Map<string, WordProgress>()
  set1.forEach((w, i) => {
    m.set(w.id, i < n
      ? { ...newProgress(w.id), box: 5, stage: 'known' }
      : newProgress(w.id))
  })
  return m
}

describe('set unlocking', () => {
  it('uses an 80% threshold', () => {
    expect(UNLOCK_THRESHOLD).toBe(0.8)
  })

  it('needs 4 of 5 words known to complete a 5-word set', () => {
    expect(isSetComplete(set1, withKnown(3))).toBe(false)
    expect(isSetComplete(set1, withKnown(4))).toBe(true)
  })

  it('treats an all-known set as complete', () => {
    expect(isSetComplete(set1, withKnown(5))).toBe(true)
  })

  it('treats an empty set as incomplete rather than dividing by zero', () => {
    expect(isSetComplete([], new Map())).toBe(false)
  })

  it('does not count words that are merely reviewing', () => {
    const m = new Map<string, WordProgress>()
    for (const w of set1) m.set(w.id, { ...newProgress(w.id), box: 3, stage: 'reviewing' })
    expect(isSetComplete(set1, m)).toBe(false)
  })

  /**
   * The map's tick and the "You know them all" screen say something to a
   * child about what they have done, so they may not round up. Opening the
   * next island may.
   */
  describe('finished is not the same as may-move-on', () => {
    it('does not call a set finished at the 80% that opens the next one', () => {
      expect(isSetComplete(set1, withKnown(4))).toBe(true)
      expect(isSetFullyKnown(set1, withKnown(4))).toBe(false)
    })

    it('calls a set finished only when every word is known', () => {
      expect(isSetFullyKnown(set1, withKnown(5))).toBe(true)
    })

    it('is false for an untouched set', () => {
      expect(isSetFullyKnown(set1, withKnown(0))).toBe(false)
    })
  })
})
