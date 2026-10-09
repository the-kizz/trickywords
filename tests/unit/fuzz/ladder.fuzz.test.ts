import { describe, it, expect } from 'vitest'
import {
  newProgress, recordCorrect, recordMiss, recordSaidIt, recordReadToAdult, decrementDue,
  recordCardRead, MAX_BOX, MAX_OVERDUE_SESSIONS, BOX_INTERVALS,
} from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'
import { prng, pick, int } from './prng'

/**
 * Random walks over the ladder. Whatever a child does, in whatever
 * order, on whatever days, these must hold -- or the map, the planner
 * and the parent summary are reading nonsense.
 */
const STAGES = new Set(['new', 'learning', 'reviewing', 'known'])
const day = (n: number) => `2026-${String(1 + Math.floor(n / 28)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`

function check(p: WordProgress, where: string) {
  expect(Number.isInteger(p.box), `${where}: box ${p.box}`).toBe(true)
  expect(p.box, where).toBeGreaterThanOrEqual(0)
  expect(p.box, where).toBeLessThanOrEqual(MAX_BOX)
  expect(Number.isInteger(p.dueInSessions), `${where}: due ${p.dueInSessions}`).toBe(true)
  expect(p.dueInSessions, where).toBeGreaterThanOrEqual(-MAX_OVERDUE_SESSIONS)
  expect(p.dueInSessions, where).toBeLessThanOrEqual(BOX_INTERVALS[MAX_BOX])
  expect(STAGES.has(p.stage), `${where}: stage ${p.stage}`).toBe(true)
  for (const k of ['attempts', 'lapses', 'correctStreak'] as const) {
    expect(Number.isInteger(p[k]) && p[k] >= 0, `${where}: ${k}=${String(p[k])}`).toBe(true)
  }
  // Optional counters: absent until first used, never negative after.
  for (const k of ['readToAdult', 'saidIt'] as const) {
    const v = p[k]
    expect(v === undefined || (Number.isInteger(v) && v >= 0), `${where}: ${k}=${String(v)}`).toBe(true)
  }
  expect(p.lastCreditedOn === null || typeof p.lastCreditedOn === 'string', where).toBe(true)
}

describe('ladder under random play', () => {
  it('keeps every field well-formed and monotone where it must be', { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = prng(seed)
      let p = newProgress(`w${seed}`)
      let today = 0
      const stageByBox = new Map<number, string>()
      for (let step = 0; step < 400; step++) {
        const before = p
        const op = pick(rng, ['correct', 'prompted', 'miss', 'missDemoted', 'said', 'read', 'tick', 'cardYes', 'cardNo', 'newDay'] as const)
        if (op === 'newDay') { today += int(rng, 1, 3); continue }
        const where = `seed ${seed} step ${step} ${op} day ${today}`
        p = op === 'correct' ? recordCorrect(p, false, day(today))
          : op === 'prompted' ? recordCorrect(p, true, day(today))
          : op === 'miss' ? recordMiss(p)
          : op === 'missDemoted' ? recordMiss(p, true)
          : op === 'said' ? recordSaidIt(p)
          : op === 'read' ? recordReadToAdult(p)
          : op === 'tick' ? decrementDue(p)
          : op === 'cardYes' ? recordCardRead(p, true, day(today))
          : recordCardRead(p, false, day(today))
        check(p, where)
        expect(p.wordId, where).toBe(before.wordId)
        expect(p.attempts, where).toBeGreaterThanOrEqual(before.attempts)
        expect(p.lapses, where).toBeGreaterThanOrEqual(before.lapses)
        // One box per step, in either direction.
        expect(Math.abs(p.box - before.box), where).toBeLessThanOrEqual(1)
        // Stage is a function of box.
        const seen = stageByBox.get(p.box)
        if (seen !== undefined && p.attempts > 0 && before.attempts > 0) expect(p.stage, where).toBe(seen)
        if (p.attempts > 0) stageByBox.set(p.box, p.stage)
        if (op === 'cardYes' || op === 'cardNo') expect(p.dueInSessions, where).toBe(before.dueInSessions)
        if (op === 'miss' || op === 'missDemoted') expect(p.dueInSessions, where).toBe(0)
      }
    }
  })

  it('never credits a word twice on the same day, however many right answers', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = prng(seed)
      let p: WordProgress = { ...newProgress('x'), box: int(rng, 0, MAX_BOX) }
      for (let d = 0; d < 20; d++) {
        const startBox = p.box
        let lowest = startBox
        for (let k = 0; k < int(rng, 1, 8); k++) {
          if (rng() < 0.8) p = recordCorrect(p, rng() < 0.3, day(d))
          else p = recordMiss(p)
          lowest = Math.min(lowest, p.box)
          // At most one credit above the lowest point reached today.
          expect(p.box - lowest, `seed ${seed} day ${d}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('cannot be run up the ladder by a card run on one day', () => {
    let p: WordProgress = { ...newProgress('x'), box: 2, stage: 'reviewing' }
    for (let k = 0; k < 50; k++) p = recordCardRead(p, true, '2026-10-09')
    expect(p.box).toBe(3)
  })
})
