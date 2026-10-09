import { describe, it, expect } from 'vitest'
import { summarizeWordProgress, wordStepLabel } from '@/lib/parent/summary'
import { MAX_BOX, newProgress } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

describe('summarizeWordProgress', () => {
  it('flags a struggling word in plain language, not a raw lapse count', () => {
    const p = { ...newProgress('where'), struggling: true, lapses: 3 }
    const text = summarizeWordProgress(p)
    expect(text).not.toContain('3')
    expect(text.toLowerCase()).toContain('slip')
  })

  it('describes a known word without exposing box numbers', () => {
    const p = { ...newProgress('the'), stage: 'known' as const, box: 5 }
    expect(summarizeWordProgress(p)).not.toMatch(/box|stage/i)
  })

  it('describes a brand-new word', () => {
    expect(summarizeWordProgress(newProgress('said'))).toMatch(/not started/i)
  })
})

/**
 * The step a parent reads. It used to be `box + 1` out of `MAX_BOX + 1`,
 * so a word never met read "Step 1 of 6 -- Not met yet": box 0 is not a
 * step they have taken.
 */
describe('how far along a word is, in words', () => {
  const at = (over: Partial<WordProgress>) =>
    wordStepLabel({ ...newProgress('the'), ...over })

  it('has nothing to count for a word with no record at all', () => {
    expect(wordStepLabel(undefined)).toBe('Not started')
  })

  it('has nothing to count for a word they have never answered', () => {
    expect(at({})).toBe('Not started')
  })

  /** True where "Not started" would be a lie about a word they have played. */
  it('calls a played but uncredited word just met', () => {
    expect(at({ box: 0, attempts: 2, stage: 'learning' })).toBe('Just met')
  })

  it('counts credits earned, out of the five that make a word known', () => {
    expect(at({ box: 1, attempts: 1 })).toBe(`Step 1 of ${MAX_BOX}`)
    expect(at({ box: 4, attempts: 4 })).toBe(`Step 4 of ${MAX_BOX}`)
  })

  it('stops counting at the top and says so', () => {
    expect(at({ box: MAX_BOX, attempts: 5, stage: 'known' })).toBe('Known')
  })

  /** Five steps, not six: there is no step 5 of 5 waiting to be taken. */
  it('never offers a step number equal to the total', () => {
    expect(at({ box: MAX_BOX, attempts: 5 })).not.toContain(`${MAX_BOX} of ${MAX_BOX}`)
  })
})
