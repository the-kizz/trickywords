import { describe, it, expect } from 'vitest'
import { newProgress, recordCorrect, decrementDue, isDue } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The review schedule has to survive a reload, and for the family surface
 * it did not.
 *
 * Every answer was written as it was given, but the countdown toward a
 * word's next review is decremented once, when the session ends -- and
 * that result was only ever put into React state. The database therefore
 * kept the countdown the word had *before* the session, so after any
 * reload every word was due again, the map said "nothing much is due",
 * and the expanding intervals this whole app is built on did nothing.
 *
 * These tests pin the shape the fix depends on: the session's end state
 * is a different set of values from the answers that made it, so it has
 * to be written separately.
 */
describe('a session end changes progress that answers alone do not', () => {
  it('leaves a promoted word not due, which is the point of promoting it', () => {
    const answered = recordCorrect(newProgress('said'), false)
    expect(answered.box).toBeGreaterThan(0)
    expect(isDue(answered)).toBe(false)
  })

  it('brings a word closer to due only when the session ends', () => {
    const answered = recordCorrect(newProgress('said'), false)
    const afterSession = decrementDue(answered)
    expect(afterSession.dueInSessions).toBeLessThan(answered.dueInSessions)
  })

  it('differs from the answer, so writing the answer alone loses it', () => {
    const answered = recordCorrect(newProgress('said'), false)
    const afterSession = decrementDue(answered)
    expect(afterSession).not.toEqual(answered)
  })

  it('eventually makes a word due again, given enough sessions', () => {
    let p: WordProgress = recordCorrect(newProgress('said'), false)
    for (let session = 0; session < 20 && !isDue(p); session++) p = decrementDue(p)
    expect(isDue(p)).toBe(true)
  })
})
