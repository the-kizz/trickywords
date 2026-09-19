import { describe, it, expect } from 'vitest'
import { similarity, rankBySimilarity } from '@/lib/words/similarity'
import type { Word } from '@/lib/words/types'

const mk = (text: string): Word => ({
  id: text, text, graphemes: [text], phonemes: ['/x/'],
  trickyIndices: [], classification: 'decodable',
  sentences: [`A ${text} here.`], audioId: text,
})

describe('similarity', () => {
  it('scores identical words as 1', () => {
    expect(similarity('them', 'them')).toBe(1)
  })

  it('scores near-miss pairs higher than unrelated pairs', () => {
    expect(similarity('them', 'then')).toBeGreaterThan(similarity('them', 'go'))
    expect(similarity('where', 'were')).toBeGreaterThan(similarity('where', 'a'))
  })

  it('is symmetric', () => {
    expect(similarity('said', 'says')).toBe(similarity('says', 'said'))
  })

  it('stays within 0..1', () => {
    for (const [a, b] of [['a', 'should'], ['I', 'I'], ['go', 'no']]) {
      const s = similarity(a, b)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('rankBySimilarity', () => {
  it('sorts most similar first and excludes the target itself', () => {
    const ranked = rankBySimilarity('them', [mk('go'), mk('then'), mk('them'), mk('the')])
    expect(ranked[0].text).toBe('then')
    expect(ranked.map((x) => x.text)).not.toContain('them')
  })

  it('is deterministic, breaking ties alphabetically', () => {
    const a = rankBySimilarity('the', [mk('be'), mk('me'), mk('we')]).map((x) => x.text)
    const b = rankBySimilarity('the', [mk('we'), mk('me'), mk('be')]).map((x) => x.text)
    expect(a).toEqual(b)
  })
})
