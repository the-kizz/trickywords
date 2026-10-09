import { describe, it, expect } from 'vitest'
import {
  dayKey, isDue, MAX_BOX, newProgress, recordCorrect, recordMiss,
} from '@/lib/engine/ladder'

const MONDAY = '2026-09-14'
const TUESDAY = '2026-09-15'

/**
 * Intervals are counted in sessions, and a session takes about a minute.
 * Measured: a perfect child made four of Set 1's five words "known" in
 * three sessions, 27 taps and roughly four minutes -- so a word could go
 * from never-seen to "Known solidly" between one cup of tea and the
 * next, while the parent area said it was known solidly.
 *
 * A word is now credited at most once per calendar day. Nothing else
 * changes: they may practise any word as often as they like, and a
 * floored round looks, sounds and feels exactly like any other.
 */
describe('a word climbs at most one box a day', () => {
  it('promotes the first unaided answer of the day', () => {
    const p = recordCorrect(newProgress('said'), false, MONDAY)
    expect(p.box).toBe(1)
    expect(p.lastCreditedOn).toBe(MONDAY)
  })

  it('holds the box on a second unaided answer the same day', () => {
    const first = recordCorrect(newProgress('said'), false, MONDAY)
    const second = recordCorrect(first, false, MONDAY)
    expect(second.box).toBe(1)
  })

  it('promotes again the next day', () => {
    const monday = recordCorrect(newProgress('said'), false, MONDAY)
    const tuesday = recordCorrect(monday, false, TUESDAY)
    expect(tuesday.box).toBe(2)
    expect(tuesday.lastCreditedOn).toBe(TUESDAY)
  })

  /** A whole afternoon of play can no longer manufacture a "known" word. */
  it('cannot take a new word to known in one sitting', () => {
    let p = newProgress('said')
    for (let i = 0; i < 12; i++) p = recordCorrect(p, false, MONDAY)
    expect(p.box).toBe(1)
    expect(p.stage).not.toBe('known')
  })

  it('takes as many days as there are boxes to reach known', () => {
    let p = newProgress('said')
    for (let day = 1; day <= MAX_BOX; day++) {
      p = recordCorrect(p, false, `2026-09-${String(day).padStart(2, '0')}`)
    }
    expect(p.box).toBe(MAX_BOX)
    expect(p.stage).toBe('known')
  })
})

/** Practice is free. Only credit is rationed. */
describe('what a floored round still does', () => {
  it('records the attempt and the unaided streak', () => {
    const first = recordCorrect(newProgress('said'), false, MONDAY)
    const second = recordCorrect(first, false, MONDAY)
    expect(second.attempts).toBe(2)
    expect(second.correctStreak).toBe(2)
  })

  it('leaves the word waiting out its ordinary interval, not churning', () => {
    const first = recordCorrect(newProgress('said'), false, MONDAY)
    const second = recordCorrect(first, false, MONDAY)
    expect(second.dueInSessions).toBe(first.dueInSessions)
  })

  it('never demotes and never reports anything a child could see', () => {
    const first = recordCorrect(newProgress('said'), false, MONDAY)
    const second = recordCorrect(first, false, MONDAY)
    expect(second.box).toBeGreaterThanOrEqual(first.box)
    expect(second.lapses).toBe(0)
  })
})

/**
 * The floor exists to stop a word climbing from new to known inside one
 * sitting. It must not also stop a word winning back a box it already
 * had: a child who slips at four o'clock and has it right again at five
 * has undone a bad minute, not gained a day.
 */
describe('a miss clears the floor', () => {
  it('lets a word they slipped on climb back the same day', () => {
    const climbed = recordCorrect(
      { ...newProgress('said'), box: 3, stage: 'reviewing' }, false, MONDAY,
    )
    expect(climbed.box).toBe(4)

    const slipped = recordMiss(climbed)
    expect(slipped.box).toBe(3)
    expect(slipped.lastCreditedOn).toBeNull()

    const back = recordCorrect(slipped, false, MONDAY)
    expect(back.box).toBe(4)
  })
})

describe('a prompted answer, with or without a day', () => {
  it('still holds the box and still claims no credit for the day', () => {
    const p = recordCorrect(newProgress('said'), true, MONDAY)
    expect(p.box).toBe(0)
    expect(p.lastCreditedOn).toBeNull()
  })
})

/**
 * The ladder is a pure function of its inputs, so it takes the day
 * rather than reading a clock. With no day given there is no floor,
 * which is what the rest of the unit suite relies on; every play surface
 * passes one.
 */
describe('the day itself', () => {
  it('applies no floor when no day is given', () => {
    let p = newProgress('said')
    for (let i = 0; i < 3; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(3)
  })

  it('is the local calendar day, zero-padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })

  /**
   * Local, not UTC: the thing being counted is a family's day, and a UTC
   * key rolls over mid-evening in half the world.
   */
  it('does not roll over in the middle of an evening', () => {
    const lateEvening = new Date(2026, 8, 14, 22, 0)
    const nextMorning = new Date(2026, 8, 15, 7, 0)
    expect(dayKey(lateEvening)).toBe('2026-09-14')
    expect(dayKey(nextMorning)).toBe('2026-09-15')
  })

  /** A record written before the field existed credits its next answer. */
  it('treats a record with no stored day as never credited', () => {
    const legacy = { ...newProgress('said'), lastCreditedOn: null, box: 2 }
    const p = recordCorrect(legacy, false, MONDAY)
    expect(p.box).toBe(3)
  })

  /** The floor governs promotion only -- the schedule is untouched. */
  it('leaves a floored word due exactly when its box says', () => {
    const first = recordCorrect(newProgress('said'), false, MONDAY)
    const second = recordCorrect(first, false, MONDAY)
    expect(isDue(second)).toBe(isDue(first))
  })
})
