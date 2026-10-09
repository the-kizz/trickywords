import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionRunner } from '@/components/SessionRunner'
import { nonFindBudgetFor } from '@/components/games'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound, roundsFinished, targetWord, totalRounds } from './answer'

/** Sets 1-3: seventeen words, most of them heart words. */
const WORDS = DEFAULT_SETS.slice(0, 3).flatMap((s) => s.words)

/**
 * A fixed day, because which words want a varied round is a function of
 * the date now (see `roundTypeFor`). On this one, 11 of these 17 words
 * want one at box 2 -- so an eight-round sitting drawn from them cannot
 * avoid every one of them, and "capped is not cut" below is a fact
 * rather than a likelihood. Local noon, so the calendar day is the same
 * in every timezone a test might run in.
 */
const A_DAY_WITH_VARIETY_DUE = new Date(2026, 8, 19, 12, 0, 0)

beforeEach(() => {
  withRevealTimers()
  vi.setSystemTime(A_DAY_WITH_VARIETY_DUE)
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * Build the Word is the longest round in the app and was meant to be an
 * occasional different way of looking at a word. Every heart word past
 * box 0 became one, and 37 of the 56 words are heart words, so measured
 * it was about half of a session from the second day on -- one live
 * nine-round sitting ran seven builds.
 *
 * The cap is now shared with Where's the heart?, because the two draw on
 * exactly the same words -- capping them separately would hand back the
 * ground this cap won. So the count here is of every round that is not
 * Find it, and which of the two a given word gets on a given day is the
 * rotation's business (see `roundTypeFor`).
 */
describe('a session is mostly Find it', () => {
  it('spends at most half its rounds on anything else', async () => {
    // Everything met, past box 0, and due: every heart word here
    // qualifies to be built, which is exactly the measured case.
    const progress = new Map(WORDS.map((w) => [w.id, {
      ...newProgress(w.id), box: 2, stage: 'learning' as const, dueInSessions: 0,
    }]))
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={progress}
        onProgressChange={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    const total = totalRounds()
    let varied = 0
    for (let round = 0; round < total; round++) {
      if (roundsFinished()) break
      const isVaried = screen.queryByTestId('tiles') !== null
        || screen.queryByTestId('heart-parts') !== null
      if (isVaried) varied++
      const word = targetWord()
      playOutReveal()
      await answerRound(word)
      playOutClosing()
      await waitFor(() => expect(
        screen.queryByTestId('celebration')
          ?? screen.queryByTestId('say-it')
          ?? screen.getByTestId('round-counter'),
      ).toBeInTheDocument())
    }

    expect(total).toBe(9)
    expect(varied).toBeLessThanOrEqual(nonFindBudgetFor(total))
    // And they still happen: capped is not cut.
    expect(varied).toBeGreaterThan(0)
  })
})
