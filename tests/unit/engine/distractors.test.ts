import { describe, it, expect } from 'vitest'
import { pickDistractors } from '@/lib/engine/distractors'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { Word } from '@/lib/words/types'

const ALL: Word[] = DEFAULT_SETS.flatMap((s) => s.words)
const byText = (t: string) => ALL.find((w) => w.text === t)!
const rng = () => 0.5

describe('pickDistractors', () => {
  it('returns one fewer word than the choice count', () => {
    const s = supportFor({ ...newProgress('them'), box: 3 })
    expect(pickDistractors(byText('them'), ALL, s, rng)).toHaveLength(3)
  })

  it('never includes the target and never duplicates', () => {
    const s = supportFor({ ...newProgress('them'), box: 4 })
    const picked = pickDistractors(byText('them'), ALL, s, rng)
    expect(picked.map((w) => w.text)).not.toContain('them')
    expect(new Set(picked.map((w) => w.id)).size).toBe(picked.length)
  })

  it('picks a far-apart distractor at the errorless level', () => {
    const s = supportFor(newProgress('them'))
    const picked = pickDistractors(byText('them'), ALL, s, rng)
    expect(picked).toHaveLength(1)
    expect(picked[0].text[0]).not.toBe('t')
  })

  it('picks confusable distractors at the hardest level', () => {
    const s = supportFor({ ...newProgress('them'), box: 5 })
    const texts = pickDistractors(byText('them'), ALL, s, rng).map((w) => w.text)
    expect(texts.some((t) => ['then', 'the', 'there', 'they'].includes(t))).toBe(true)
  })

  it('avoids sharing the initial letter at the different-initial level', () => {
    const s = supportFor({ ...newProgress('call'), box: 1 })
    const picked = pickDistractors(byText('call'), ALL, s, rng)
    expect(picked.every((w) => w.text[0] !== 'c')).toBe(true)
  })

  it('falls back gracefully when the pool cannot satisfy the rule', () => {
    const tiny = [byText('go'), byText('no'), byText('so')]
    const s = supportFor({ ...newProgress('go'), box: 5 })
    const picked = pickDistractors(byText('go'), tiny, s, rng)
    expect(picked).toHaveLength(2)
    expect(picked.map((w) => w.text).sort()).toEqual(['no', 'so'])
  })

  it('is deterministic for a given rng', () => {
    const s = supportFor({ ...newProgress('what'), box: 3 })
    const a = pickDistractors(byText('what'), ALL, s, rng).map((w) => w.id)
    const b = pickDistractors(byText('what'), ALL, s, rng).map((w) => w.id)
    expect(a).toEqual(b)
  })
})
