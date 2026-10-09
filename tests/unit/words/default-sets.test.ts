import { describe, it, expect } from 'vitest'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { wordSetSchema } from '@/lib/words/types'

const ALL = () => DEFAULT_SETS.flatMap((s) => s.words)

describe('default word sets', () => {
  it('has 12 sets containing 56 words', () => {
    expect(DEFAULT_SETS).toHaveLength(12)
    expect(ALL()).toHaveLength(56)
  })

  it('every set validates against the schema', () => {
    for (const set of DEFAULT_SETS) {
      expect(() => wordSetSchema.parse(set)).not.toThrow()
    }
  })

  it('gives every word a segmentation that rebuilds the word', () => {
    for (const w of ALL()) {
      expect(w.graphemes.length).toBe(w.phonemes.length)
      expect(w.graphemes.join('')).toBe(w.text)
    }
  })

  it('marks tricky indices in range, and only on heart words', () => {
    for (const w of ALL()) {
      for (const i of w.trickyIndices) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(w.graphemes.length)
      }
      if (w.classification === 'heart') {
        expect(w.trickyIndices.length).toBeGreaterThan(0)
      } else {
        expect(w.trickyIndices).toEqual([])
      }
    }
  })

  it('is honest that this/then/go/so/no are decodable, not tricky', () => {
    const byText = new Map(ALL().map((w) => [w.text, w]))
    for (const t of ['this', 'then', 'go', 'so', 'no']) {
      expect(byText.get(t)?.classification).toBe('decodable')
    }
  })

  it('treats the all/call/ball/tall group as a spelling family', () => {
    const byText = new Map(ALL().map((w) => [w.text, w]))
    for (const t of ['all', 'call', 'ball', 'tall']) {
      expect(byText.get(t)?.classification).toBe('family')
    }
  })

  it('gives every word a sentence that contains it', () => {
    for (const w of ALL()) {
      expect(w.sentences.length).toBeGreaterThan(0)
      for (const s of w.sentences) {
        expect(s.toLowerCase()).toContain(w.text.toLowerCase())
      }
    }
  })

  it('gives every word a unique id and audioId', () => {
    const words = ALL()
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length)
    expect(new Set(words.map((w) => w.audioId)).size).toBe(words.length)
  })
})
