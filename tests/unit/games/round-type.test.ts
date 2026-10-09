import { describe, it, expect } from 'vitest'
import {
  HEART_ROUND_ENABLED,
  MAX_NON_FIND_SHARE, MIN_BOX_TO_BUILD, MIN_GRAPHEMES_TO_BUILD, nonFindBudgetFor,
  roundCycleFor, ROUND_TYPES, roundTypeFor, type RoundType,
} from '@/components/games'
import { buildRound } from '@/lib/engine/session'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
/** A heart word: the irregular part is what the other two rounds are for. */
const said = ALL.find((w) => w.text === 'said')!
/** Fully decodable -- nothing in it to mark with a heart. */
const that = ALL.find((w) => w.text === 'that')!

const roundFor = (word: typeof said, over: Partial<WordProgress> = {}) =>
  buildRound({
    word,
    words: ALL,
    progress: new Map([[word.id, { ...newProgress(word.id), ...over }]]),
    isFinal: false,
  })

const none = new Set<string>()

/** A run of consecutive days, as the ladder writes them. */
const days = (count: number, from = '2026-09-18') => {
  const start = new Date(`${from}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000)
    return d.toISOString().slice(0, 10)
  })
}

/** Every type this word is given across a fortnight, uncapped. */
const overAFortnight = (round: ReturnType<typeof roundFor>) =>
  days(14).map((day) => roundTypeFor(round, none, Infinity, day))

describe('the types a word may meet', () => {
  it('offers four rounds, and no chooser between them', () => {
    expect(Object.keys(ROUND_TYPES).sort()).toEqual(['build', 'find', 'heart', 'read'])
  })

  it('finds a word the child is meeting for the first time, every day', () => {
    expect(roundCycleFor(roundFor(said))).toEqual(['find'])
    expect(new Set(overAFortnight(roundFor(said)))).toEqual(new Set(['find']))
  })

  /**
   * Box 1 offers the heart round and not building: naming the tricky
   * part comes before reproducing the whole spelling -- see
   * `MIN_BOX_TO_BUILD`.
   */
  // The heart round is switched off -- InitiaLit-F does not teach naming
  // the tricky part, see `HEART_ROUND_ENABLED`. These assert what a child
  // actually meets today *and* what they would meet if it were turned back
  // on, so the rotation stays covered either way and flipping the flag
  // cannot quietly change the ladder.
  const withHeart = (types: RoundType[]) =>
    HEART_ROUND_ENABLED ? types : types.filter((t) => t !== 'heart')

  it('offers Find it and Read it at box 1, with a grown-up there', () => {
    expect(roundCycleFor(roundFor(said, { box: 1 }), true))
      .toEqual(withHeart(['find', 'read', 'heart']))
  })

  it('offers all of them from box 2 on, with a grown-up there', () => {
    for (const box of [MIN_BOX_TO_BUILD, 3, 4, 5]) {
      expect(roundCycleFor(roundFor(said, { box }), true))
        .toEqual(withHeart(['find', 'read', 'heart', 'build']))
    }
  })

  /**
   * Nothing in this app listens, so a child on their own can only judge
   * their own reading -- and a self-report resolves as prompted, which
   * takes no credit and resets the review interval to 1. A word gets one
   * round a sitting and the rotation is keyed to the day, so a word whose
   * turn it was to be read could not be credited that day at all.
   * Simulated on a fresh island that cost a solo child 60-75% more days
   * to know it, for no evidence gained. Alone, the reading moment is the
   * one at the end of a sitting, which claims nothing by it.
   */
  describe('on their own', () => {
    it('never offers Read it', () => {
      for (const box of [1, 2, 3, 4, 5]) {
        expect(roundCycleFor(roundFor(said, { box })), `box ${box}`)
          .not.toContain('read')
      }
    })

    it('leaves a decodable word with nothing but Find it', () => {
      // The words this would hurt most: no heart, so no Build either.
      expect(roundCycleFor(roundFor(that, { box: 3 }))).toEqual(['find'])
      expect(roundCycleFor(roundFor(that, { box: 3 }), true)).toEqual(['find', 'read'])
    })

    it('still builds, because building needs nobody to watch it', () => {
      expect(roundCycleFor(roundFor(said, { box: 3 }))).toContain('build')
    })
  })

  it('does not offer the heart round while it is switched off', () => {
    if (HEART_ROUND_ENABLED) return
    for (const box of [1, 2, 3, 4, 5]) {
      expect(roundCycleFor(roundFor(said, { box }))).not.toContain('heart')
    }
  })

  /**
   * There is nothing in a decodable word for the heart to land on, and
   * nothing for Build the Word to mark -- but it is still read. At
   * school `that` and `all` are cards in the same deck as `said`; only
   * this app draws the distinction, and only for rounds that are about
   * the heart.
   */
  it('finds and reads a word with no irregular part, and never builds it', () => {
    expect(roundCycleFor(roundFor(that, { box: 3 }), true)).toEqual(['find', 'read'])
    // Nor a spelling-family word: `all` is regular, and a heart drawn on
    // it would teach a child to distrust sounding out.
    const all = ALL.find((w) => w.text === 'all')!
    expect(roundCycleFor(roundFor(all, { box: 3 }), true)).toEqual(['find', 'read'])
  })

  /** A word that keeps slipping gets the gentlest round, not the longest. */
  it('only ever finds a word that is struggling, whatever box it is on', () => {
    expect(roundCycleFor(roundFor(said, { box: 4, struggling: true }))).toEqual(['find'])
    expect(new Set(overAFortnight(roundFor(said, { box: 4, struggling: true }))))
      .toEqual(new Set(['find']))
  })

  /**
   * Building a one-grapheme word is a single tap on a single tile, and
   * there is no part of it to point at either: "I" and "a" are heart
   * words with one grapheme each. Seen on a phone -- "Build the word",
   * one dashed slot, and four tiles for the word "I".
   */
  describe('a word with only one grapheme gets neither of the other two', () => {
    const single = ALL.filter((w) => w.graphemes.length < MIN_GRAPHEMES_TO_BUILD)

    /**
     * Never built and never pointed into -- one tile is one tap. But
     * still read: "I" and "a" are cards at school like every other word,
     * and a round that skipped them would skip them for good.
     */
    it('is found and read, never built', () => {
      expect(single.map((w) => w.text).sort()).toEqual(['I', 'a', 'or'])
      for (const w of single) {
        const cycle = roundCycleFor(roundFor(w, { box: 3, stage: 'reviewing' }), true)
        expect(cycle, w.text).toEqual(['find', 'read'])
      }
    })

    it('still offers building to a multi-grapheme heart word at the same box', () => {
      expect(roundCycleFor(roundFor(said, { box: 3, stage: 'reviewing' }), true))
        .toContain('build')
    })
  })
})

/**
 * Tomorrow differs from today by design. Nine measured sittings ran
 * Build the Word on `little`, in the same slot, every single time.
 */
describe('the rotation', () => {
  it('gives a word a different round type from one day to the next', () => {
    const round = roundFor(said, { box: 3 })
    const over = overAFortnight(round)
    for (let i = 1; i < over.length; i++) {
      expect(over[i], `day ${i} repeated day ${i - 1}`).not.toBe(over[i - 1])
    }
  })

  it('takes a word through every type it is eligible for', () => {
    for (const box of [1, 3]) {
      const round = roundFor(said, { box })
      expect(new Set(overAFortnight(round)))
        .toEqual(new Set(roundCycleFor(round)))
    }
  })

  /** No history is stored: the same word on the same day, same round. */
  it('is decided by the word and the day alone', () => {
    const round = roundFor(said, { box: 3 })
    expect(roundTypeFor(round, none, Infinity, '2026-09-18'))
      .toBe(roundTypeFor(round, none, Infinity, '2026-09-18'))
    // And it comes round again exactly one cycle later.
    const cycle = roundCycleFor(round).length
    const [first, later] = [days(1 + cycle)[0], days(1 + cycle)[cycle]]
    expect(roundTypeFor(round, none, Infinity, first))
      .toBe(roundTypeFor(round, none, Infinity, later))
  })

  /**
   * Offset per word, or every eligible word on an island would want the
   * same type on the same day and a sitting would read as "today is
   * building day" -- a theme, not a rotation.
   */
  it('does not rotate the whole deck in lockstep', () => {
    const heartWords = ALL
      .filter((w) => w.classification === 'heart' && w.trickyIndices.length > 0
        && w.graphemes.length >= MIN_GRAPHEMES_TO_BUILD)
      .slice(0, 12)
    const today = '2026-09-18'
    const types = new Set<RoundType>(
      heartWords.map((w) => roundTypeFor(roundFor(w, { box: 3 }), none, Infinity, today)),
    )
    expect(types.size).toBeGreaterThan(1)
  })
})

describe('how much of a session may be anything but Find it', () => {
  it('is half the rounds', () => {
    expect(MAX_NON_FIND_SHARE).toBeCloseTo(1 / 2)
    expect(nonFindBudgetFor(9)).toBe(4)
    expect(nonFindBudgetFor(6)).toBe(3)
  })

  /**
   * Never none: a child who only ever plays short sittings would
   * otherwise never meet these rounds at all.
   */
  it('always allows one, however short the sitting', () => {
    expect(nonFindBudgetFor(1)).toBe(1)
    expect(nonFindBudgetFor(2)).toBe(1)
    expect(nonFindBudgetFor(0)).toBe(1)
  })

  /** A day on which this word wants something other than Find it. */
  // With a grown-up there, so Read it is in the cycle -- the budget is
  // shared between the two varied rounds and that is what these assert.
  function variedDay(round: ReturnType<typeof roundFor>): string {
    const day = days(14).find((d) => roundTypeFor(round, none, Infinity, d, true) !== 'find')
    if (!day) throw new Error('no day in a fortnight wants a varied round')
    return day
  }

  it('finds a word once the budget is spent, however eligible it is', () => {
    const round = roundFor(said, { box: 3 })
    const day = variedDay(round)
    expect(roundTypeFor(round, none, 1, day, true)).not.toBe('find')
    // One other word already varied, and a budget of one.
    expect(roundTypeFor(round, new Set(['was']), 1, day, true)).toBe('find')
    expect(roundTypeFor(round, new Set(['was']), 2, day, true)).not.toBe('find')
  })

  /**
   * One budget between all three, not one each. Where's the heart? draws
   * on exactly the same words as Build the Word, so separate caps would
   * hand back the ground the build cap won -- building was measured at
   * about half of every session before it was capped.
   */
  it('spends one budget between the two varied rounds', () => {
    // At box 1 the varied round is the heart; with the heart off, a word's
    // first varied round is Build, at box 2. Either way it is one budget,
    // and the word only gets a varied round once there is room for a second.
    const round = roundFor(said, { box: 1 })
    const day = variedDay(round)
    expect(roundTypeFor(round, new Set(['was']), 1, day, true)).toBe('find')
    expect(roundTypeFor(round, new Set(['was']), 2, day, true)).not.toBe('find')
  })

  it('gives a word one round other than Find it per session, not two', () => {
    const round = roundFor(said, { box: 3 })
    const day = variedDay(round)
    expect(roundTypeFor(round, none, 9, day, true)).not.toBe('find')
    expect(roundTypeFor(round, new Set([said.id]), 9, day, true)).toBe('find')
  })
})
