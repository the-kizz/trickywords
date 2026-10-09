import { describe, it, expect, beforeEach } from 'vitest'
import { currentSet } from '@/lib/engine/unlock'
import { newProgress } from '@/lib/engine/ladder'
import { getDb, type Db } from '@/lib/db/client'
import { createProfile } from '@/lib/db/profiles'
import { getLastSetId, setLastSetId } from '@/lib/db/progress'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

/** Every word of these sets met, at the box given. */
function met(setIds: number[], box: number): Map<string, WordProgress> {
  const m = new Map<string, WordProgress>()
  for (const set of DEFAULT_SETS) {
    if (!setIds.includes(set.id)) continue
    for (const w of set.words) {
      m.set(w.id, {
        ...newProgress(w.id), box,
        stage: box >= 5 ? 'known' : 'learning',
      })
    }
  }
  return m
}

/**
 * Which island the map calls "here" -- the one that pulses, carries the
 * companion, and is scrolled into view on arrival.
 *
 * The answer has to survive a reload. It used to come from React state
 * alone, so every reload answered "the first island under the move-on
 * threshold" -- Set 1, for a child whose homework is Set 7.
 */
describe('the island the child is on', () => {
  it('is the island they last played, whatever the map would otherwise guess', () => {
    expect(currentSet(DEFAULT_SETS, met([7], 2), 7)?.id).toBe(7)
    expect(currentSet(DEFAULT_SETS, new Map(), 9)?.id).toBe(9)
  })

  /**
   * What a record saved before the island was persisted falls back to.
   * Free choice means the islands behind them may never have been
   * touched, so "the first one they have not finished" is the wrong guess;
   * the furthest one they have actually put a word into is a real trace of
   * where they were.
   */
  it('falls back to the furthest island they have actually touched', () => {
    expect(currentSet(DEFAULT_SETS, met([7], 2), null)?.id).toBe(7)
    expect(currentSet(DEFAULT_SETS, met([2, 5], 1), undefined)?.id).toBe(5)
  })

  it('moves past an island they have already done enough of', () => {
    // Set 1 fully known and nothing else touched: they are not still on it.
    expect(currentSet(DEFAULT_SETS, met([1], 5), null)?.id).toBe(2)
  })

  it('is the first unfinished island for a child who has played nothing', () => {
    expect(currentSet(DEFAULT_SETS, new Map(), null)?.id).toBe(1)
  })

  it('has nothing to say about an empty map', () => {
    expect(currentSet([], new Map(), null)).toBeNull()
  })
})

describe('the island a family profile was last on', () => {
  let db: Db
  let profileId: number

  beforeEach(() => {
    db = getDb(':memory:')
    profileId = createProfile(db, { name: 'Robin', avatar: 'fox' }).id
  })

  it('is absent until a session has started', () => {
    expect(getLastSetId(db, profileId)).toBeNull()
  })

  it('round-trips, and is kept per child', () => {
    const other = createProfile(db, { name: 'Sam', avatar: 'owl' }).id
    setLastSetId(db, profileId, 7)
    setLastSetId(db, other, 2)
    expect(getLastSetId(db, profileId)).toBe(7)
    expect(getLastSetId(db, other)).toBe(2)
  })

  it('keeps only the most recent island', () => {
    setLastSetId(db, profileId, 3)
    setLastSetId(db, profileId, 4)
    expect(getLastSetId(db, profileId)).toBe(4)
  })
})
