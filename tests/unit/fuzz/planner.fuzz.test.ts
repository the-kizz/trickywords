import { describe, it, expect } from 'vitest'
import { planSession, SESSION_LENGTH } from '@/lib/engine/session'
import { newProgress, MAX_BOX } from '@/lib/engine/ladder'
import { roundTypeFor, MIN_BOX_TO_BUILD, MIN_GRAPHEMES_TO_BUILD } from '@/components/games/index'
import { HEART_ROUND_ENABLED } from '@/lib/teaching'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'
import { prng, pick, int } from './prng'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)

function randomProgress(rng: () => number, ids: string[]): Map<string, WordProgress> {
  const m = new Map<string, WordProgress>()
  for (const id of ids) {
    if (rng() < 0.3) continue // never met
    const box = int(rng, 0, MAX_BOX)
    m.set(id, {
      ...newProgress(id), box,
      stage: box === 0 ? 'learning' : box === MAX_BOX ? 'known' : 'reviewing',
      dueInSessions: int(rng, -5, 16), attempts: int(rng, 0, 40), lapses: int(rng, 0, 10),
      correctStreak: int(rng, 0, 10), struggling: rng() < 0.1,
    })
  }
  return m
}

describe('session planning under random progress', () => {
  it('always yields a sane session', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = prng(seed)
      const set = pick(rng, DEFAULT_SETS)
      // The island plus a random slice of everything else, like a real map.
      const pool = [...set.words, ...ALL.filter(() => rng() < 0.25)]
      const words = [...new Map(pool.map((w) => [w.id, w])).values()]
      const progress = randomProgress(rng, words.map((w) => w.id))
      const islandIds = new Set(set.words.map((w) => w.id))
      const where = `seed ${seed} set ${set.id}`
      const plan = planSession({ words, islandIds, progress, rng })
      expect(plan.rounds.length, where).toBeGreaterThan(0)
      expect(plan.rounds.length, where).toBeLessThanOrEqual(SESSION_LENGTH)
      const ids = plan.rounds.map((r) => r.word.id)
      // The closing round re-asks a word from earlier in the session on
      // purpose (`closingWord`); nothing else may repeat.
      const body = ids.slice(0, -1)
      expect(new Set(body).size, `${where}: duplicate word in one session`).toBe(body.length)
      plan.rounds.forEach((r, i) => {
        const w = `${where} round ${i} ${r.word.id}`
        expect(r.isFinal, w).toBe(i === plan.rounds.length - 1)
        expect(r.distractors.some((d) => d.id === r.word.id), `${w}: target among distractors`).toBe(false)
        expect(new Set(r.distractors.map((d) => d.id)).size, `${w}: duplicate distractor`).toBe(r.distractors.length)
        expect(r.distractors.length, w).toBe(r.support.choices - 1)
        expect(r.box, w).toBe(progress.get(r.word.id)?.box ?? 0)
      })
      for (const id of plan.uncreditedNew) expect(ids, `${where}: uncredited word not in session`).toContain(id)
    }
  })

  it('copes with an empty island and with one word', () => {
    expect(() => planSession({ words: [], progress: new Map(), rng: prng(1) })).not.toThrow()
    const one = planSession({ words: [ALL[0]], progress: new Map(), rng: prng(1) })
    expect(one.rounds.length).toBeLessThanOrEqual(SESSION_LENGTH)
  })
})

describe('round choice under random conditions', () => {
  it('never picks a round the word or the setting cannot support', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = prng(seed)
      const word = pick(rng, ALL)
      const box = int(rng, 0, MAX_BOX)
      const grownUp = rng() < 0.5
      const reveal = rng() < 0.3
      const day = `2026-${String(int(rng, 1, 12)).padStart(2, '0')}-${String(int(rng, 1, 28)).padStart(2, '0')}`
      const budget = pick(rng, [0, 1, 2, Infinity])
      const used = new Set(rng() < 0.3 ? [word.id] : [])
      const round = {
        word, distractors: [], box, isFinal: false,
        support: { choices: 2, similarity: 'far' as const, showWordBeforeRound: reveal },
      }
      const type = roundTypeFor(round, used, budget, day, grownUp)
      const where = `seed ${seed} ${word.id} box ${box} grownUp ${grownUp} ${day}`
      expect(['find', 'build', 'heart', 'read'], where).toContain(type)
      if (!HEART_ROUND_ENABLED) expect(type, where).not.toBe('heart')
      if (!grownUp) expect(type, where).not.toBe('read')
      if (box < 1 || reveal) expect(type, where).toBe('find')
      if (used.size >= budget || used.has(word.id)) expect(type, where).toBe('find')
      if (type === 'build') {
        expect(box, where).toBeGreaterThanOrEqual(MIN_BOX_TO_BUILD)
        expect(word.graphemes.length, where).toBeGreaterThanOrEqual(MIN_GRAPHEMES_TO_BUILD)
        expect(word.trickyIndices.length, where).toBeGreaterThan(0)
      }
    }
  })
})
