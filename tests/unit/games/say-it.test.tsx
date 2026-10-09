import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SayIt } from '@/components/games/SayIt'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress, recordSaidIt } from '@/lib/engine/ladder'
import { MIN_TARGET_PX } from '@/lib/constants'
import { PHRASES, wordAudioUrl } from '@/lib/audio/manifest'
import type { WordProgress } from '@/lib/engine/types'
import { playOutClosing, playOutReveal, withRevealTimers } from './reveal'
import { answerRound } from '../components/answer'
import { installClipHarness } from '../audio/clip-harness'

/**
 * Item 5: nothing in this app had ever asked the child to say a word.
 *
 * Everything else trains sound to form -- they hear a word and pick it
 * out of a row. Reading is the other direction, and it is what a teacher
 * means by "read it to me". The say-it round is the one moment that asks
 * for it: the word alone, no clip for it, they read it, then tap the
 * speaker to check, then say for themselves whether they had it.
 *
 * No microphone. Ever. Nothing here listens.
 */

const WORDS = DEFAULT_SETS[0].words
const said = DEFAULT_SETS.flatMap((s) => s.words).find((w) => w.text === 'said')!

let played: string[] = []

beforeEach(() => {
  withRevealTimers()
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => { vi.useRealTimers() })

describe('the say-it round', () => {
  const render_ = (o: Partial<Parameters<typeof SayIt>[0]> = {}) =>
    render(<SayIt word={said} onSaid={vi.fn()} onAgain={vi.fn()} {...o} />)

  it('shows the word alone, with its heart marks', () => {
    render_()
    expect(screen.getByTestId('say-it-word')).toHaveTextContent(said.text)
  })

  it('speaks the instruction, because a pre-reader cannot read it', () => {
    render_()
    expect(screen.getByText(PHRASES.sayIt)).toBeInTheDocument()
    expect(played.join(' ')).toContain('/audio/phrases/sayIt.ogg')
  })

  it('does not say the word for them', () => {
    render_()
    expect(played.join(' ')).not.toContain(wordAudioUrl(said.audioId))
  })

  it('says the word when they tap the speaker to check themselves', async () => {
    render_()
    await userEvent.click(screen.getByRole('button', { name: /hear the word/i }))
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
  })

  it('offers two controls, both big enough for a small finger', () => {
    render_()
    for (const name of ['I said that', 'Let me try again']) {
      const button = screen.getByRole('button', { name })
      expect(button.style.minHeight).toBe(`${MIN_TARGET_PX}px`)
      expect(button.style.minWidth).toBe(`${MIN_TARGET_PX}px`)
    }
  })

  it('treats both controls as successes, and neither as a failure', async () => {
    const onSaid = vi.fn()
    const onAgain = vi.fn()
    render_({ onSaid, onAgain })

    await userEvent.click(screen.getByRole('button', { name: 'Let me try again' }))
    expect(onAgain).toHaveBeenCalled()
    expect(onSaid).not.toHaveBeenCalled()

    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'score', 'failed']) {
      expect(body).not.toContain(banned)
    }
  })

  it('never asks for a microphone', () => {
    const { container } = render_()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(document.body.textContent!.toLowerCase()).not.toContain('microphone')
    expect(navigator.mediaDevices).toBeUndefined()
  })
})

/** Recorded, and recorded only. */
describe('what a say-it round records', () => {
  it('counts the reading without touching the ladder', () => {
    const before: WordProgress = { ...newProgress(said.id), box: 3, stage: 'reviewing' }
    const after = recordSaidIt(before)
    expect(after.saidIt).toBe(1)
    expect(after.box).toBe(before.box)
    expect(after.stage).toBe(before.stage)
    expect(after.lapses).toBe(before.lapses)
    expect(after.correctStreak).toBe(before.correctStreak)
  })

  it('can never demote', () => {
    let p: WordProgress = { ...newProgress(said.id), box: 5, stage: 'known' }
    for (let i = 0; i < 3; i++) p = recordSaidIt(p)
    expect(p.box).toBe(5)
    expect(p.saidIt).toBe(3)
  })
})

describe('the say-it round inside a session', () => {
  async function playToTheEnd(length: number) {
    const onProgressChange = vi.fn<(p: WordProgress) => void>()
    const onComplete = vi.fn()
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))}
        onProgressChange={onProgressChange}
        onComplete={onComplete}

        sessionLength={length}
      />,
    )
    const answered: string[] = []
    for (let round = 0; round < length; round++) {
      if (screen.queryByTestId('say-it') || screen.queryByTestId('celebration')) break
      const word = document.querySelector('[data-target-word]')!
        .getAttribute('data-target-word')!
      answered.push(word)
      playOutReveal()
      await answerRound(word)
      playOutClosing()
    }
    return { onProgressChange, onComplete, answered }
  }

  it('comes last, on a word they have just answered well', async () => {
    const { answered } = await playToTheEnd(4)
    await waitFor(() => expect(screen.getByTestId('say-it')).toBeInTheDocument())
    expect(screen.queryByTestId('celebration')).toBeNull()
    expect(answered).toContain(
      document.querySelector('[data-target-word]')!.getAttribute('data-target-word')!,
    )
  })

  it('ends the session happily when they say they read it', async () => {
    const { onComplete, onProgressChange } = await playToTheEnd(4)
    await waitFor(() => expect(screen.getByTestId('say-it')).toBeInTheDocument())
    // Counted as a rise rather than as a total: a Read it round earlier
    // in the same session is also them saying they read a word, and lands
    // in the same count. What this asserts is that *this* moment adds
    // one -- see `recordSaidIt`.
    const before = onProgressChange.mock.calls.at(-1)?.[0].saidIt ?? 0
    await userEvent.click(screen.getByRole('button', { name: 'I said that' }))

    await waitFor(() => expect(screen.getByTestId('celebration')).toBeInTheDocument())
    expect(onComplete).toHaveBeenCalledTimes(1)
    const recorded = onProgressChange.mock.calls.at(-1)![0]
    expect(recorded.saidIt).toBe(before + 1)
  })

  it('replays instead of ending when they would rather try again', async () => {
    const { onComplete } = await playToTheEnd(4)
    await waitFor(() => expect(screen.getByTestId('say-it')).toBeInTheDocument())
    played = []
    await userEvent.click(screen.getByRole('button', { name: 'Let me try again' }))

    expect(screen.getByTestId('say-it')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    // The round starts over, instruction and all.
    await waitFor(() =>
      expect(played.join(' ')).toContain('/audio/phrases/sayIt.ogg'))
  })
})
