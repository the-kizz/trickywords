import { describe, it, expect } from 'vitest'
import { companionStage, highWaterKnown, COMPANION_THRESHOLDS } from '@/lib/rewards'

describe('companion growth', () => {
  it('grows at 0, 5, 15, 30 and 45 known words', () => {
    expect([...COMPANION_THRESHOLDS]).toEqual([0, 5, 15, 30, 45])
  })

  it('advances a stage at each threshold', () => {
    expect(companionStage(0)).toBe(0)
    expect(companionStage(4)).toBe(0)
    expect(companionStage(5)).toBe(1)
    expect(companionStage(15)).toBe(2)
    expect(companionStage(30)).toBe(3)
    expect(companionStage(45)).toBe(4)
  })

  it('never exceeds the final stage, even beyond all 56 words', () => {
    expect(companionStage(56)).toBe(4)
    expect(companionStage(999)).toBe(4)
  })

  it('never shrinks as the child learns more', () => {
    for (let i = 1; i <= 56; i++) {
      expect(companionStage(i)).toBeGreaterThanOrEqual(companionStage(i - 1))
    }
  })
})

/**
 * Nothing a child has earned is ever taken away. The companion is drawn
 * from this mark, not from what is known today, so a word that slips a
 * box after a wrong tap costs them nothing they can see.
 */
describe('the high-water mark of known words', () => {
  it('seeds from what is known now when there is no mark yet', () => {
    expect(highWaterKnown(undefined, 7)).toBe(7)
  })

  it('never falls when a word slips out of known', () => {
    expect(highWaterKnown(12, 11)).toBe(12)
    expect(highWaterKnown(12, 0)).toBe(12)
  })

  it('rises when more words are known than ever before', () => {
    expect(highWaterKnown(12, 13)).toBe(13)
  })

  it('keeps the companion stage through a miss', () => {
    const before = highWaterKnown(undefined, 15)
    const after = highWaterKnown(before, 14)
    expect(companionStage(after)).toBe(companionStage(before))
  })
})
