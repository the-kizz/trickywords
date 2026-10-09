import { describe, it, expect } from 'vitest'
import { newProgress } from '@/lib/engine/ladder'
import { supportFor } from '@/lib/engine/support'
import type { WordProgress } from '@/lib/engine/types'

const at = (box: number, struggling = false): WordProgress => ({
  ...newProgress('some'), box, struggling,
})

describe('support level (errorless fading)', () => {
  it('gives a brand-new word two far-apart choices and full prompting', () => {
    expect(supportFor(at(0))).toEqual({
      choices: 2, similarity: 'far', showWordBeforeRound: true,
    })
  })

  it('stops showing the word once past box 0', () => {
    expect(supportFor(at(1)).showWordBeforeRound).toBe(false)
  })

  // Support never fades by withholding the spoken word: every game
  // speaks the target at the start of every round, at every box. See
  // the note in `support.ts` -- the old `speakBeforeRound` flag made
  // words at box 2 and up unpromotable in the games where hearing the
  // word is the only way to know what to look for.
  it('never withholds the spoken word as a way of fading support', () => {
    for (const box of [0, 1, 2, 3, 4, 5]) {
      expect(supportFor(at(box))).not.toHaveProperty('speakBeforeRound')
    }
  })

  it('widens the choice count as the word strengthens', () => {
    expect([0,1,2,3,4,5].map((b) => supportFor(at(b)).choices))
      .toEqual([2, 3, 3, 4, 4, 4])
  })

  it('tightens distractor similarity as the word strengthens', () => {
    expect([0,1,2,3,4,5].map((b) => supportFor(at(b)).similarity)).toEqual([
      'far', 'different-initial', 'different-initial',
      'shared-letter', 'near', 'near',
    ])
  })

  it('returns a struggling word all the way to errorless, whatever its box', () => {
    expect(supportFor(at(4, true))).toEqual(supportFor(at(0)))
  })
})
