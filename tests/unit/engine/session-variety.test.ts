import { describe, it, expect } from 'vitest'
import {
  closingWord, MAX_REVIEW_FROM_OTHER_SETS, planSession, sessionPool, sessionQueue,
  shuffled, withinTiers,
} from '@/lib/engine/session'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The measurement this file exists for: **seven consecutive sittings
 * across three days were byte-identical.** Set 7, played nine times, ran
 * `all ball call little tall all` every time -- alphabetical, Build the
 * Word on the same word in the same slot, and the say-it word `all` in
 * all nine. Nothing randomised the order of a session: `sessionQueue`
 * and `closingWord` both ended their sort on `a.id.localeCompare(b.id)`,
 * and once a set has been played a few times every word on it is tied on
 * everything above that -- same box, same `dueInSessions` -- so the
 * alphabet was the whole order.
 *
 * What must *not* change is which words a sitting contains. The spacing
 * schedule decides that, and the shuffle is inside a tier, never across
 * one: most overdue still leads less overdue, due still leads new, the
 * tapped island still leads elsewhere.
 */

/** A seeded PRNG, so a test that is *about* randomness is repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SET7 = DEFAULT_SETS.find((s) => s.id === 7)!
const ISLAND_IDS = new Set(SET7.words.map((w) => w.id))

/** Set 7 as the father's tablet had it from the third sitting on. */
function met(box: number, dueInSessions = 0): Map<string, WordProgress> {
  const m = new Map<string, WordProgress>()
  for (const w of SET7.words) {
    m.set(w.id, { ...newProgress(w.id), box, stage: 'learning', dueInSessions })
  }
  return m
}

/** One sitting's rounds, as the word ids a child would meet in order. */
const sitting = (rng: () => number, progress = met(3)) =>
  planSession({
    words: SET7.words, islandIds: ISLAND_IDS, progress, rng,
  }).rounds.map((r) => r.word.id)

describe('no two sittings the same', () => {
  /**
   * Seven sittings, one after another off the same stream of randomness
   * -- which is what seven evenings on the same island actually is.
   */
  const SITTINGS = 7
  const sevenSittings = () => {
    const rng = seeded(20260917)
    return Array.from({ length: SITTINGS }, () => sitting(rng))
  }

  it('does not play the same order twice in seven sittings', () => {
    const orders = sevenSittings().map((ids) => ids.join(' '))
    expect(new Set(orders).size).toBe(SITTINGS)
  })

  /**
   * The other half of the promise, and the one that matters more: the
   * *set* of words is the schedule's business, not the shuffle's. Seven
   * sittings, seven different orders, the same five words every time.
   */
  it('still asks for exactly the words the schedule chose', () => {
    const expected = [...SET7.words.map((w) => w.id)].sort()
    for (const ids of sevenSittings()) {
      // The closing round is an appended repeat of a word already asked,
      // so the distinct words are the queue and nothing else.
      expect([...new Set(ids)].sort()).toEqual(expected)
    }
  })

  it('never lets the shuffle lengthen or shorten a sitting', () => {
    const lengths = new Set(sevenSittings().map((ids) => ids.length))
    expect([...lengths]).toEqual([SET7.words.length + 1])
  })

  /** And the say-it word, which was `all` in all nine measured sittings. */
  it('ends on a different word from one sitting to the next', () => {
    const rng = seeded(4)
    const progress = met(3)
    const chosen = new Set(
      Array.from({ length: SITTINGS }, () => closingWord({
        words: SET7.words,
        progress,
        answeredWell: new Set(SET7.words.map((w) => w.id)),
        missed: new Set<string>(),
        fallback: SET7.words[0],
        rng,
      }).id),
    )
    expect(chosen.size).toBeGreaterThan(1)
  })
})

/**
 * The shuffle is inside a tier. Every one of these held before wave 9 and
 * has to go on holding: the schedule, not the dice, decides what a
 * sitting is made of.
 */
describe('the shuffle never crosses a tier', () => {
  it('keeps the most overdue word first, every sitting', () => {
    const progress = met(3)
    progress.set('tall', { ...progress.get('tall')!, dueInSessions: -7 })
    progress.set('little', { ...progress.get('little')!, dueInSessions: -3 })
    const rng = seeded(11)
    for (let i = 0; i < 20; i++) {
      const ids = sitting(rng, progress)
      expect(ids.slice(0, 2)).toEqual(['tall', 'little'])
    }
  })

  it('keeps the weaker word ahead of the stronger one at the same due date', () => {
    const progress = met(4)
    progress.set('ball', { ...progress.get('ball')!, box: 1 })
    const rng = seeded(12)
    for (let i = 0; i < 20; i++) {
      expect(sitting(rng, progress)[0]).toBe('ball')
    }
  })

  it('keeps every due word ahead of every new one', () => {
    // Two of Set 7 met and due; the other three never met.
    const progress = new Map<string, WordProgress>()
    for (const w of SET7.words.slice(0, 2)) {
      progress.set(w.id, { ...newProgress(w.id), box: 2, stage: 'learning', dueInSessions: 0 })
    }
    const rng = seeded(13)
    for (let i = 0; i < 20; i++) {
      const ids = sitting(rng, progress)
      const lastDue = Math.max(...[...progress.keys()].map((id) => ids.indexOf(id)))
      const firstNew = Math.min(
        ...SET7.words.filter((w) => !progress.has(w.id)).map((w) => ids.indexOf(w.id)),
      )
      expect(lastDue).toBeLessThan(firstNew)
    }
  })

  it('keeps the tapped island ahead of review from elsewhere, and capped', () => {
    const set6 = DEFAULT_SETS.find((s) => s.id === 6)!
    const islandIds = new Set(set6.words.map((w) => w.id))
    const progress = met(1)
    const pool = sessionPool(set6.words, SET7.words)
    const rng = seeded(14)
    for (let i = 0; i < 20; i++) {
      const { words } = sessionQueue({ words: pool, islandIds, progress, rng })
      const fromElsewhere = words.filter((w) => ISLAND_IDS.has(w.id))
      expect(fromElsewhere).toHaveLength(MAX_REVIEW_FROM_OTHER_SETS)
      const firstElsewhere = words.findIndex((w) => ISLAND_IDS.has(w.id))
      const lastIsland = words.reduce(
        (last, w, i) => (islandIds.has(w.id) ? i : last), -1,
      )
      expect(lastIsland).toBeLessThan(firstElsewhere)
    }
  })

  /**
   * A second go the same day, when nothing is due and nothing is new. It
   * is practice and it cannot promote anything, but it must not be the
   * same practice every time either.
   */
  it('varies the order of a practice go too, and stays on the island', () => {
    const progress = met(5, 8)
    for (const [id, p] of progress) progress.set(id, { ...p, stage: 'known' })
    const rng = seeded(15)
    const orders = new Set(
      Array.from({ length: 7 }, () => sessionQueue({
        words: SET7.words, islandIds: ISLAND_IDS, progress, rng,
      }).words.map((w) => w.id).join(' ')),
    )
    expect(orders.size).toBeGreaterThan(1)
    for (const order of orders) {
      expect(order.split(' ').sort()).toEqual([...SET7.words.map((w) => w.id)].sort())
    }
  })
})

/**
 * `planSession` takes an `rng` and the engine reaches for nothing else,
 * so a plan is exactly as repeatable as the randomness it is handed.
 * This is why every other test in the suite can still name an order.
 */
describe('randomness arrives through the rng and nowhere else', () => {
  it('plans the same sitting twice from the same seed', () => {
    const a = sitting(seeded(99))
    const b = sitting(seeded(99))
    expect(a).toEqual(b)
  })

  it('plans a different sitting from a different seed', () => {
    expect(sitting(seeded(1))).not.toEqual(sitting(seeded(77)))
  })
})

describe('the shuffle itself', () => {
  it('keeps every item exactly once', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffled(items, seeded(3))
    expect([...out].sort((a, b) => a - b)).toEqual(items)
  })

  it('leaves the caller\'s array alone', () => {
    const items = [1, 2, 3, 4, 5]
    shuffled(items, seeded(3))
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  it('reaches every order of three items, given enough goes', () => {
    const rng = seeded(7)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(shuffled(['a', 'b', 'c'], rng).join(''))
    expect(seen.size).toBe(6)
  })

  it('orders by tier and shuffles only inside one', () => {
    const items = [
      { id: 'a', tier: 0 }, { id: 'b', tier: 1 }, { id: 'c', tier: 1 },
      { id: 'd', tier: 1 }, { id: 'e', tier: 2 },
    ]
    const rng = seeded(8)
    const middles = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const out = withinTiers(items, (x, y) => x.tier - y.tier, rng)
      expect(out[0].id).toBe('a')
      expect(out[4].id).toBe('e')
      middles.add(out.slice(1, 4).map((x) => x.id).join(''))
    }
    expect(middles.size).toBeGreaterThan(1)
  })
})
