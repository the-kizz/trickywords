import { describe, it, expect } from 'vitest'
import {
  newProgress, recordCorrect, recordMiss, decrementDue, isDue, BOX_INTERVALS,
  MAX_OVERDUE_SESSIONS,
} from '@/lib/engine/ladder'

describe('ladder', () => {
  it('starts a word new, in box 0, due immediately', () => {
    const p = newProgress('said')
    expect(p).toMatchObject({
      wordId: 'said', stage: 'new', box: 0, dueInSessions: 0,
      correctStreak: 0, attempts: 0, lapses: 0, struggling: false,
    })
    expect(isDue(p)).toBe(true)
  })

  it('uses expanding intervals measured in sessions', () => {
    expect([...BOX_INTERVALS]).toEqual([0, 1, 2, 4, 8, 16])
  })

  it('promotes one box on an unprompted correct answer', () => {
    const p = recordCorrect(newProgress('said'), false)
    expect(p.box).toBe(1)
    expect(p.correctStreak).toBe(1)
    expect(p.attempts).toBe(1)
    expect(p.dueInSessions).toBe(BOX_INTERVALS[1])
  })

  it('does not promote on a prompted correct answer, but counts the attempt', () => {
    const p = recordCorrect(newProgress('said'), true)
    expect(p.box).toBe(0)
    expect(p.attempts).toBe(1)
    expect(p.correctStreak).toBe(0)
  })

  it('moves new -> learning -> reviewing -> known as the box climbs', () => {
    let p = newProgress('said')
    expect(p.stage).toBe('new')
    p = recordCorrect(p, false)
    expect(p.stage).toBe('learning')
    p = recordCorrect(p, false); p = recordCorrect(p, false)
    expect(p.stage).toBe('reviewing')
    p = recordCorrect(p, false); p = recordCorrect(p, false)
    expect(p.box).toBe(5)
    expect(p.stage).toBe('known')
  })

  it('never climbs past the top box', () => {
    let p = newProgress('said')
    for (let i = 0; i < 20; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(5)
  })

  it('drops one box on a miss, counts a lapse, and comes back soon', () => {
    let p = newProgress('said')
    for (let i = 0; i < 4; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(4)
    p = recordMiss(p)
    expect(p).toMatchObject({ box: 3, lapses: 1, correctStreak: 0, dueInSessions: 0 })
    expect(p.stage).toBe('reviewing')
  })

  /**
   * The arc the gameplay review measured. A word at the top of the
   * ladder, answered correctly a dozen times, used to return to the very
   * beginning on one wrong tap -- which is why an ordinary child who is
   * right about 80% of the time never finished Set 1: words were knocked
   * down faster than they could climb. A single lapse is not forgetting.
   */
  it('costs a box-5 word one box, not everything, and still brings it back', () => {
    let p = newProgress('said')
    for (let i = 0; i < 5; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(5)
    p = recordMiss(p)
    expect(p.box).toBe(4)
    expect(p.dueInSessions).toBe(0)
  })

  it('costs nothing more for the second and third miss of the same session', () => {
    let p = newProgress('said')
    for (let i = 0; i < 5; i++) p = recordCorrect(p, false)
    p = recordMiss(p)
    p = recordMiss(p, true)
    p = recordMiss(p, true)
    expect(p.box).toBe(4)
    // Every one of them is still recorded, so the struggler threshold
    // sees a bad minute for what it is.
    expect(p.lapses).toBe(3)
  })

  it('cannot fall below the first box', () => {
    expect(recordMiss(newProgress('said')).box).toBe(0)
  })

  it('never returns a lapsed word to the new stage', () => {
    const p = recordMiss(recordCorrect(newProgress('said'), false))
    expect(p.stage).not.toBe('new')
  })

  /**
   * Past zero the countdown keeps going, into the negative: how long a
   * word has been waiting is the only thing a progress record could sort
   * "oldest first" on, and it used to be thrown away at zero.
   */
  it('counts down due sessions, and on past zero to record how long it has waited', () => {
    let p = recordCorrect(newProgress('said'), false)
    expect(p.dueInSessions).toBe(1)
    p = decrementDue(p)
    expect(p.dueInSessions).toBe(0)
    expect(isDue(p)).toBe(true)
    p = decrementDue(p)
    expect(p.dueInSessions).toBe(-1)
    expect(isDue(p)).toBe(true)
  })

  it('stops counting at the overdue floor, so one long absence cannot run away', () => {
    let p = { ...newProgress('said'), dueInSessions: 0 }
    for (let i = 0; i < MAX_OVERDUE_SESSIONS + 50; i++) p = decrementDue(p)
    expect(p.dueInSessions).toBe(-MAX_OVERDUE_SESSIONS)
  })

  it('does not mutate the input', () => {
    const p = newProgress('said')
    recordCorrect(p, false)
    expect(p.box).toBe(0)
  })

  it('brings a prompted word back next session rather than waiting out its box', () => {
    let p = newProgress('where')
    for (let i = 0; i < 4; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(4)
    expect(p.dueInSessions).toBe(8)
    p = recordCorrect(p, true)
    expect(p.box).toBe(4)          // still not promoted
    expect(p.dueInSessions).toBe(1) // but back next session
  })
})
