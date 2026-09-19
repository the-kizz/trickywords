import { describe, it, expect } from 'vitest'
import { seedProgressForSignedOffSets } from '@/lib/parent/starting-point'
import { MAX_BOX } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

describe('seedProgressForSignedOffSets', () => {
  it('seeds every word in a signed-off set at known/top box', () => {
    const seeded = seedProgressForSignedOffSets(DEFAULT_SETS, [1])
    const set1 = DEFAULT_SETS.find((s) => s.id === 1)!
    expect(seeded.size).toBe(set1.words.length)
    for (const word of set1.words) {
      const p = seeded.get(word.id)!
      expect(p.stage).toBe('known')
      expect(p.box).toBe(MAX_BOX)
      expect(p.lapses).toBe(0)
      expect(p.struggling).toBe(false)
    }
  })

  it('leaves words from sets that were not signed off untouched', () => {
    const seeded = seedProgressForSignedOffSets(DEFAULT_SETS, [1])
    const set2 = DEFAULT_SETS.find((s) => s.id === 2)!
    for (const word of set2.words) {
      expect(seeded.has(word.id)).toBe(false)
    }
  })

  it('seeds across several signed-off sets at once', () => {
    const seeded = seedProgressForSignedOffSets(DEFAULT_SETS, [1, 2, 3])
    const wordCount = [1, 2, 3]
      .map((id) => DEFAULT_SETS.find((s) => s.id === id)!.words.length)
      .reduce((a, b) => a + b, 0)
    expect(seeded.size).toBe(wordCount)
  })

  it('produces an empty map when nothing is signed off', () => {
    expect(seedProgressForSignedOffSets(DEFAULT_SETS, []).size).toBe(0)
  })

  it('ignores unknown set ids rather than throwing', () => {
    expect(() => seedProgressForSignedOffSets(DEFAULT_SETS, [999])).not.toThrow()
    expect(seedProgressForSignedOffSets(DEFAULT_SETS, [999]).size).toBe(0)
  })
})
