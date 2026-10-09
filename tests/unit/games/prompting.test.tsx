import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROUND_TYPES } from '@/components/games'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { HeartWordBuilder } from '@/components/games/HeartWordBuilder'
import { ReadIt } from '@/components/games/ReadIt'
import { GAP_MS } from '@/lib/audio/player'
import { CLIP_MS } from '@/lib/audio/durations'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'
import { applyStruggleRules } from '@/lib/engine/strugglers'
import type { Round } from '@/lib/engine/session'
import type { WordProgress } from '@/lib/engine/types'
import { installClipHarness } from '../audio/clip-harness'
import { answered } from './celebration'

/** Past any instruction clip, whichever game this is. */
const LONGEST_CLIP_MS = Math.max(...Object.values(CLIP_MS))

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!

/**
 * Box 3: support has faded as far as the choice count and distractor
 * similarity go. This is exactly where the ladder used to stall -- the
 * word was no longer spoken automatically, so the only way to learn it
 * was the speaker button, which counted as a hint and blocked promotion.
 */
const atBox3: WordProgress = { ...newProgress('said'), box: 3, stage: 'reviewing' }

const boxThreeRound: Round = {
  word: said,
  distractors: [
    ALL.find((w) => w.text === 'go')!,
    ALL.find((w) => w.text === 'the')!,
    ALL.find((w) => w.text === 'my')!,
  ],
  support: supportFor(atBox3),
  box: 0,
  isFinal: false,
}

let played: string[] = []

beforeEach(() => {
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => {
  vi.useRealTimers()
})

/** What the ladder does with the answer the game just reported. */
function afterAnswer(prompted: boolean): WordProgress {
  return applyStruggleRules(recordCorrect(atBox3, prompted))
}

/**
 * Every round but Read it, which is the one exception and has to be.
 *
 * The rule the others keep -- the target word is always spoken at the
 * start, at every support level -- exists because hearing the word is
 * the only way to know what to find. Read it asks the opposite question:
 * they are given the word in writing and have to produce the sound. Playing
 * the clip would answer it for them. Asserted below, the other way round.
 */
const SOUND_FIRST = Object.entries(ROUND_TYPES).filter(([name]) => name !== 'read')

describe.each(SOUND_FIRST)('round type: %s', (_name, Game) => {
  it('speaks the target word at the start of the round, even at box 3', () => {
    vi.useFakeTimers()
    render(<Game round={boxThreeRound} onAnswer={() => {}} onMiss={() => {}} />)
    // Long enough for any instruction clip to finish and the word to
    // follow it -- the waits are per-clip now, so the test cannot name a
    // single delay constant. See `speakSequence`.
    act(() => {
      vi.advanceTimersByTime(LONGEST_CLIP_MS + GAP_MS + 50)
    })
    expect(played.join(' ')).toContain(`/audio/words/${said.audioId}.ogg`)
  })

  it('lets the instruction finish before the word starts', () => {
    vi.useFakeTimers()
    render(<Game round={boxThreeRound} onAnswer={() => {}} onMiss={() => {}} />)
    // Nothing but the instruction has been heard yet: the word waits on a
    // real measured duration, not the 600ms guess that used to truncate
    // "Find the word" (1.2s) every single round.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(played.join(' ')).not.toContain(`/audio/words/${said.audioId}.ogg`)
  })
})

describe('Read it, the one round that withholds the word', () => {
  it('never speaks the target word while it is still asking', () => {
    vi.useFakeTimers()
    render(<ReadIt round={boxThreeRound} onAnswer={() => {}} onMiss={() => {}} />)
    act(() => { vi.advanceTimersByTime(LONGEST_CLIP_MS * 3 + GAP_MS) })
    expect(played.join(' ')).not.toContain(`/audio/words/${said.audioId}.ogg`)
  })

  it('still says the instruction, which a pre-reader cannot read either', () => {
    vi.useFakeTimers()
    render(<ReadIt round={boxThreeRound} onAnswer={() => {}} onMiss={() => {}} />)
    act(() => { vi.advanceTimersByTime(LONGEST_CLIP_MS + GAP_MS + 50) })
    expect(played.join(' ')).toContain('/audio/phrases/sayIt.ogg')
  })
})

describe('the first listen is free, the second is a hint', () => {
  it('promotes a box-3 word answered correctly on the first hearing', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={boxThreeRound} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
    expect(afterAnswer(onAnswer.mock.calls[0][1]).box).toBe(4)
  })

  it('does not promote the same word once it has been heard a second time', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={boxThreeRound} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
    expect(afterAnswer(onAnswer.mock.calls[0][1]).box).toBe(3)
  })

  it('does not promote a word that was missed before being found', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={boxThreeRound} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
    expect(afterAnswer(onAnswer.mock.calls[0][1]).box).toBe(3)
  })

  it('promotes a box-3 word built after one free listen in Build the Word', async () => {
    const onAnswer = vi.fn()
    render(<HeartWordBuilder round={boxThreeRound} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
    expect(afterAnswer(onAnswer.mock.calls[0][1]).box).toBe(4)
  })

  it('does not promote it in Build the Word after a second listen', async () => {
    const onAnswer = vi.fn()
    render(<HeartWordBuilder round={boxThreeRound} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }

    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
    expect(afterAnswer(onAnswer.mock.calls[0][1]).box).toBe(3)
  })
})
