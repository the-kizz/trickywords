import { describe, it, expect } from 'vitest'
import {
  nonFindBudgetFor, roundCycleFor, roundTypeFor, type RoundType,
} from '@/components/games'
import { planSession } from '@/lib/engine/session'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

/**
 * Tomorrow differs from today, at the level of a whole go.
 *
 * Nine measured sittings on Set 7 ran Build the Word on `little`, in the
 * same slot, every single time -- because the round type was a pure
 * function of the word's box, and a box moves about once every two days.
 * It is a function of the word and the *date* now, so the same child on
 * the same island meets a different shape of sitting from one evening to
 * the next, and nothing has to be stored to make that true.
 */

const SET3 = DEFAULT_SETS.find((s) => s.id === 3)! // seven heart words
const ISLAND_IDS = new Set(SET3.words.map((w) => w.id))
const rng = () => 0.5

function atBox(box: number): Map<string, WordProgress> {
  const m = new Map<string, WordProgress>()
  for (const w of SET3.words) {
    m.set(w.id, {
      ...newProgress(w.id), box, stage: box >= 3 ? 'reviewing' : 'learning', dueInSessions: 0,
    })
  }
  return m
}

const days = (count: number, from = '2026-09-18') => {
  const start = new Date(`${from}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) =>
    new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10))
}

/**
 * One go, as the runner plays it: the same plan, and `roundTypeFor`
 * called per round with the session's own shared budget and record --
 * see `SessionRunner.pickRoundType`.
 */
function goOn(day: string, box = 3): RoundType[] {
  const { rounds } = planSession({
    words: SET3.words, islandIds: ISLAND_IDS, progress: atBox(box), rng,
  })
  const varied = new Set<string>()
  const budget = nonFindBudgetFor(rounds.length)
  return rounds.map((round) => {
    const type = roundTypeFor(round, varied, budget, day)
    if (type !== 'find') varied.add(round.word.id)
    return type
  })
}

describe('a go on the same island, on consecutive days', () => {
  it('is not the same shape two days running', () => {
    const shapes = days(7).map((day) => goOn(day).join(' '))
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i], `day ${i}`).not.toBe(shapes[i - 1])
    }
  })

  it('keeps Find it at least half of every go', () => {
    for (const day of days(14)) {
      const types = goOn(day)
      const finds = types.filter((t) => t === 'find').length
      expect(finds, day).toBeGreaterThanOrEqual(types.length - nonFindBudgetFor(types.length))
    }
  })

  it('never gives one word two varied rounds in a go', () => {
    for (const day of days(14)) {
      const { rounds } = planSession({
        words: SET3.words, islandIds: ISLAND_IDS, progress: atBox(3), rng,
      })
      const varied = new Set<string>()
      const budget = nonFindBudgetFor(rounds.length)
      const twice: string[] = []
      for (const round of rounds) {
        const type = roundTypeFor(round, varied, budget, day)
        if (type !== 'find') {
          if (varied.has(round.word.id)) twice.push(round.word.id)
          varied.add(round.word.id)
        }
      }
      expect(twice, day).toEqual([])
    }
  })

  /**
   * Over a fortnight a word meets every round it is eligible for, which
   * is the whole claim: a word that was a Find yesterday is a Build or a
   * Where's-the-heart today, where it qualifies.
   */
  it('takes each word through its whole cycle over a fortnight', () => {
    const seen = new Map<string, Set<RoundType>>()
    for (const day of days(14)) {
      const { rounds } = planSession({
        words: SET3.words, islandIds: ISLAND_IDS, progress: atBox(3), rng,
      })
      for (const round of rounds) {
        const type = roundTypeFor(round, new Set<string>(), Infinity, day)
        const set = seen.get(round.word.id) ?? new Set<RoundType>()
        set.add(type)
        seen.set(round.word.id, set)
      }
    }
    for (const w of SET3.words) {
      const round = planSession({
        words: SET3.words, islandIds: ISLAND_IDS, progress: atBox(3), rng,
      }).rounds.find((r) => r.word.id === w.id)!
      expect([...seen.get(w.id)!].sort(), w.id)
        .toEqual([...roundCycleFor(round)].sort())
    }
  })

  /** And a first sitting is Find it throughout, whatever day it is. */
  it('is all Find it while every word is at box 0', () => {
    for (const day of days(7)) {
      expect(new Set(goOn(day, 0))).toEqual(new Set(['find']))
    }
  })
})
