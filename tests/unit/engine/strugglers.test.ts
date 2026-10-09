import { describe, it, expect } from 'vitest'
import { newProgress, recordCorrect, recordMiss } from '@/lib/engine/ladder'
import {
  applyStruggleRules, STRUGGLE_LAPSE_THRESHOLD, STRUGGLE_CLEAR_STREAK,
} from '@/lib/engine/strugglers'

const missTimes = (n: number) => {
  let p = newProgress('where')
  for (let i = 0; i < n; i++) p = applyStruggleRules(recordMiss(p))
  return p
}

describe('struggler detection', () => {
  it('uses a 3-lapse threshold and a 2-streak clear', () => {
    expect(STRUGGLE_LAPSE_THRESHOLD).toBe(3)
    expect(STRUGGLE_CLEAR_STREAK).toBe(2)
  })

  it('does not flag a word before the threshold', () => {
    expect(missTimes(2).struggling).toBe(false)
  })

  it('flags a word on the third lapse', () => {
    expect(missTimes(3).struggling).toBe(true)
  })

  it('keeps the flag after only one unprompted correct answer', () => {
    expect(applyStruggleRules(recordCorrect(missTimes(3), false)).struggling).toBe(true)
  })

  it('clears the flag after two consecutive unprompted correct answers', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, false))
    p = applyStruggleRules(recordCorrect(p, false))
    expect(p.struggling).toBe(false)
  })

  it('clears the lapse count along with the flag', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, false))
    p = applyStruggleRules(recordCorrect(p, false))
    expect(p).toMatchObject({ struggling: false, lapses: 0 })
  })

  /**
   * The three-lapse threshold measures the current struggle, not the
   * child's whole history. A lifetime counter meant the clear branch
   * dropped the flag and the next answer immediately re-flagged the
   * word, so it never left easy mode again.
   */
  it('does not re-flag a cleared word on its very next lapse', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, false))
    p = applyStruggleRules(recordCorrect(p, false))
    expect(p.struggling).toBe(false)

    p = applyStruggleRules(recordMiss(p))
    expect(p).toMatchObject({ struggling: false, lapses: 1 })
  })

  it('flags the word again once it genuinely slips three more times', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, false))
    p = applyStruggleRules(recordCorrect(p, false))
    for (let i = 0; i < 3; i++) p = applyStruggleRules(recordMiss(p))
    expect(p.struggling).toBe(true)
  })

  it('does not let prompted answers clear the flag', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, true))
    p = applyStruggleRules(recordCorrect(p, true))
    expect(p.struggling).toBe(true)
  })
})
