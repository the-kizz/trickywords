import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound, roundsFinished, targetWord, totalRounds } from './answer'
import type { WordProgress } from '@/lib/engine/types'

/**
 * Item 2a of the gameplay review, walked through a real session.
 *
 * A round's support was decided when the session was planned, from a
 * snapshot taken before the child had answered anything -- so a word's
 * second appearance in a session was still planned at the box it started
 * at. Measured: session one on a new set was eight copying rounds, no
 * retrievals, and every word ended at box 2.
 *
 * A word promoted earlier in the same session must get harder in it.
 */

const WORDS = DEFAULT_SETS[0].words

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

describe('a word that was promoted this session gets harder in it', () => {
  it('stops showing the written word once the word has left box 0', async () => {
    const onProgressChange = vi.fn<(p: WordProgress) => void>()
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))}
        onProgressChange={onProgressChange}
        onComplete={vi.fn()}
       
        sessionLength={8}
      />,
    )

    const seen = new Map<string, number>()
    const repeats: { word: string; prompted: boolean }[] = []

    const total = totalRounds()
    for (let round = 0; round < total; round++) {
      if (roundsFinished()) break
      const word = targetWord()
      const promptShown = screen.queryByTestId('prompt-word') !== null
      const timesSeen = seen.get(word) ?? 0
      if (timesSeen > 0) repeats.push({ word, prompted: promptShown })
      seen.set(word, timesSeen + 1)

      playOutReveal()
      await answerRound(word)
      playOutClosing()
      await waitFor(() => expect(
        screen.queryByTestId('celebration') ?? screen.getByTestId('round-counter'),
      ).toBeInTheDocument())
    }

    // The session really does ask for some word twice -- otherwise there
    // would be nothing here to prove.
    expect(repeats.length).toBeGreaterThan(0)
    // And not one of those repeat rounds was a copy: every word had been
    // answered correctly already, so every one of them had left box 0.
    for (const repeat of repeats) {
      expect(repeat.prompted, `${repeat.word} was shown in writing again`).toBe(false)
    }
  })
})
