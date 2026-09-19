import { describe, it, expect } from 'vitest'
import {
  MAX_NEW_WORDS_CREDITED, planSession, sessionPool, sessionQueue,
} from '@/lib/engine/session'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

/**
 * A sitting on an island covers that island.
 *
 * Measured: a fresh Set 7 asked `all, call, ball` and closed on `all` --
 * four rounds, three words, `tall` and `little` never met. The father
 * tapped Set 7 repeatedly and never saw `little`. `MAX_NEW_WORDS = 3`
 * was being applied as a cap on *coverage*, and three is the framework's
 * number for *introduce*: InitiaLit-F introduces tricky words two at a
 * time, InitiaLit-1 three at a time, and both then practise the whole
 * set on cards every day. "Introduce three" was never "show three".
 */

const rng = () => 0.5
const SET7 = DEFAULT_SETS.find((s) => s.id === 7)!
const ISLAND_IDS = new Set(SET7.words.map((w) => w.id))
const ids = (ws: { id: string }[]) => ws.map((w) => w.id)

const freshSitting = (island = SET7) => planSession({
  words: island.words,
  islandIds: new Set(ids(island.words)),
  progress: new Map(),
  rng,
})

describe('a first sitting on a fresh island meets the whole island', () => {
  it('asks for every word on it, `tall` and `little` included', () => {
    const { rounds } = freshSitting()
    expect([...new Set(rounds.map((r) => r.word.id))].sort())
      .toEqual([...ids(SET7.words)].sort())
  })

  /** Six rounds rather than four: five reveals and one closing repeat. */
  it('runs a round per word, plus the closing repeat', () => {
    expect(freshSitting().rounds).toHaveLength(SET7.words.length + 1)
  })

  it('covers a seven-word island too, inside one sitting', () => {
    const set3 = DEFAULT_SETS.find((s) => s.id === 3)!
    const { rounds } = freshSitting(set3)
    expect(new Set(rounds.map((r) => r.word.id)).size).toBe(set3.words.length)
  })

  /**
   * Every one of them plays the same round. The cap is on credit, and
   * credit is invisible -- there is no second, lesser kind of round.
   */
  it('gives the uncredited words the same errorless round as the rest', () => {
    const { rounds, uncreditedNew } = freshSitting()
    const shown = rounds.filter((r) => uncreditedNew.has(r.word.id))
    expect(shown.length).toBeGreaterThan(0)
    for (const r of shown) {
      expect(r.support.showWordBeforeRound).toBe(true)
      expect(r.box).toBe(0)
      expect(r.support).toEqual(rounds[0].support)
    }
  })
})

describe('three first meetings may be credited, the rest may not', () => {
  it('withholds credit from the unmet words past the cap', () => {
    const { uncreditedNew } = freshSitting()
    expect(uncreditedNew.size).toBe(SET7.words.length - MAX_NEW_WORDS_CREDITED)
  })

  /**
   * In **set order**, which is the framework's introduction order -- not
   * in the shuffled play order. An island fills front to back whatever
   * order a given evening happens to run in, so which words are credited
   * is never a matter of luck.
   */
  it('credits the island\'s first three words, whatever order they play in', () => {
    const { uncreditedNew } = freshSitting()
    expect([...uncreditedNew].sort())
      .toEqual(ids(SET7.words).slice(MAX_NEW_WORDS_CREDITED).sort())
  })

  it('withholds nothing on an island of three or fewer unmet words', () => {
    const set11 = DEFAULT_SETS.find((s) => s.id === 11)! // four words
    const progress = new Map<string, WordProgress>([
      [set11.words[0].id, { ...newProgress(set11.words[0].id), box: 2, dueInSessions: 0 }],
    ])
    const { uncreditedNew } = planSession({
      words: set11.words, islandIds: new Set(ids(set11.words)), progress, rng,
    })
    expect(uncreditedNew.size).toBe(0)
  })

  it('withholds nothing from a sitting that is pure review', () => {
    const progress = new Map(SET7.words.map((w) => [w.id, {
      ...newProgress(w.id), box: 2, stage: 'learning' as const, dueInSessions: 0,
    }]))
    const { uncreditedNew } = planSession({
      words: SET7.words, islandIds: ISLAND_IDS, progress, rng,
    })
    expect(uncreditedNew.size).toBe(0)
  })

  /** And nothing on a practice go, where there is no credit to give. */
  it('withholds nothing on a second go the same day', () => {
    const progress = new Map(SET7.words.map((w) => [w.id, {
      ...newProgress(w.id), box: 5, stage: 'known' as const, dueInSessions: 8,
    }]))
    const { uncreditedNew, words } = sessionQueue({
      words: SET7.words, islandIds: ISLAND_IDS, progress, rng,
    })
    expect(words.length).toBeGreaterThan(0)
    expect(uncreditedNew.size).toBe(0)
  })

  /**
   * A word shown but not credited is a met word at box 0 with an attempt
   * on it, so it is due next session and credited then. That is the whole
   * of "become creditable the next day" -- there is nothing to remember
   * between sittings.
   */
  it('credits the withheld words the next time round', () => {
    const held = [...freshSitting().uncreditedNew]
    // What the runner records for them: correct, unaided, uncreditable.
    const progress = new Map<string, WordProgress>()
    for (const w of SET7.words) {
      const creditable = !held.includes(w.id)
      progress.set(w.id, recordCorrect(newProgress(w.id), false, '2026-09-17', creditable))
    }
    for (const id of held) expect(progress.get(id)!.box).toBe(0)

    // Tomorrow. Nothing is unmet any more, so nothing is withheld, and
    // every word is due -- box 0 and box 1 both come back next session.
    const { rounds, uncreditedNew } = planSession({
      words: SET7.words, islandIds: ISLAND_IDS, progress, rng,
    })
    expect(uncreditedNew.size).toBe(0)
    const asked = new Set(rounds.map((r) => r.word.id))
    for (const id of held) expect(asked.has(id)).toBe(true)
  })
})

/**
 * Coverage is of the island the child tapped, and it does not become a
 * licence to fill a sitting from everywhere: the cap on review from other
 * islands still stands, and the island still leads.
 */
describe('coverage does not cost the rest of the rules', () => {
  it('still reviews elsewhere, after the island and capped', () => {
    const set6 = DEFAULT_SETS.find((s) => s.id === 6)!
    const progress = new Map(SET7.words.map((w) => [w.id, {
      ...newProgress(w.id), box: 1, stage: 'learning' as const, dueInSessions: -2,
    }]))
    const { words } = sessionQueue({
      words: sessionPool(set6.words, SET7.words),
      islandIds: new Set(ids(set6.words)),
      progress,
      rng,
    })
    // Every Set 6 word, and review from Set 7 behind it.
    for (const w of set6.words) expect(ids(words)).toContain(w.id)
    const firstElsewhere = words.findIndex((w) => ISLAND_IDS.has(w.id))
    expect(firstElsewhere).toBe(set6.words.length)
  })

  it('never asks the same word twice running', () => {
    const { rounds } = freshSitting()
    const backToBack = rounds
      .filter((r, i) => i > 0 && r.word.id === rounds[i - 1].word.id)
    expect(backToBack).toEqual([])
  })

  it('never runs past the session length, however big the island', () => {
    const island = { ...SET7, words: DEFAULT_SETS.flatMap((s) => s.words) }
    const { rounds, uncreditedNew } = freshSitting(island)
    expect(rounds.length).toBeLessThanOrEqual(9)
    // And nothing the sitting could not fit is marked uncredited, which
    // would be a promise about a round that never happened.
    const asked = new Set(rounds.map((r) => r.word.id))
    for (const id of uncreditedNew) expect(asked.has(id)).toBe(true)
  })
})
