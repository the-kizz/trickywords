import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRoundAudio } from '@/components/games/useRoundAudio'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import { playOutReveal, withRevealTimers } from './reveal'
import { answered } from './celebration'

/**
 * Item 2b of the gameplay review: a round in which the written word was
 * on screen *beside the choices* is a copy, not a recall, and must not
 * promote the word -- the child could match shapes without reading
 * anything. It may still record the answer, keep the streak and end
 * happily; it simply is not evidence.
 *
 * The reveal (item 3) is what makes the combination impossible in the
 * games as they stand, and also what stops the rule being a dead end: a
 * word must still be able to leave box 0, and once the word is hidden
 * before the choices appear, answering is a recall and may promote.
 *
 * The probe below is what a game that ignored the rule would look like
 * -- choices live while the word is still up -- so the ladder rule can
 * be checked rather than assumed.
 */

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!
const go = ALL.find((w) => w.text === 'go')!

const boxZero = (): Round => ({
  word: said,
  distractors: [go],
  support: supportFor(newProgress(said.id)),
  box: 0,
  isFinal: false,
})

/** A game that shows its choices while the word is still on screen. */
function Copying({ round, onAnswer }: {
  round: Round
  onAnswer: (correct: boolean, prompted: boolean) => void
}) {
  const { prompted } = useRoundAudio(round, 'findTheWord', undefined, true)
  return (
    <button type="button" onClick={() => onAnswer(true, prompted)}>said</button>
  )
}

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

describe('a round with the word still on screen never promotes', () => {
  it('reports the answer as prompted, so the box is held', async () => {
    const onAnswer = vi.fn()
    render(<Copying round={boxZero()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
    const after = recordCorrect(newProgress(said.id), onAnswer.mock.calls[0][1])
    expect(after.box).toBe(0)
    // Still a happy ending, and still recorded.
    expect(after.attempts).toBe(1)
    expect(after.correctStreak).toBe(0)
  })

  it('reports the same answer as unprompted once the word has gone', async () => {
    const onAnswer = vi.fn()
    render(<Copying round={boxZero()} onAnswer={onAnswer} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })
})

/**
 * The rule must not trap a new word at box 0 -- a child has to be able
 * to start somewhere. Answering after the reveal is a retrieval, so it
 * promotes.
 */
describe('a word can still leave box 0 from a standing start', () => {
  it('promotes a brand-new word answered once the word has been hidden', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={boxZero()} onAnswer={onAnswer} onMiss={() => {}} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: said.text }))

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
    expect(recordCorrect(newProgress(said.id), false).box).toBe(1)
  })
})
