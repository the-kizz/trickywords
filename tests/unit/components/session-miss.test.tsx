import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'
import { STRUGGLE_LAPSE_THRESHOLD } from '@/lib/engine/strugglers'
import type { WordProgress } from '@/lib/engine/types'
import { playOutClosing, withRevealTimers } from '../games/reveal'

/** Language a child must never meet, whatever they tap. */
const FAILURE_WORDS = ['wrong', 'incorrect', 'failed', 'you lose', 'game over']

/**
 * Set 2, and `that` -- the one decodable word in it.
 *
 * A heart word past box 0 is built rather than found (see
 * `roundTypeFor`), and Build the Word has no wrong tap to make: a decoy
 * is exploring, not missing. What is under test here is the miss
 * channel, so the round has to be a Find it, which is what a decodable
 * word always gets.
 */
const WORDS = DEFAULT_SETS[1].words
const TARGET = WORDS.find((w) => w.text === 'that')!

beforeEach(() => {
  // A correct answer on a box-3 word no longer resolves its round on the
  // tap -- the chest opens and the sentence is read first (see
  // `ChestReveal`, `SentenceMoment`). Fake timers that still advance
  // with real time let those moments be played out without the file
  // waiting several real seconds for each of them.
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * `that` at box 3 is the strongest word in the set, so it is the single
 * round of a one-round session, and box 3 gives four choices -- three
 * of them wrong, which is enough taps to cross the struggler threshold
 * inside one round.
 */
function seeded(overrides: Partial<WordProgress> = {}) {
  const progress = new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))
  // Everything else parked in the future, so the session's queue is
  // exactly this one word -- a session asks for what is due, oldest
  // first (see `sessionQueue`).
  for (const [id, p] of progress) {
    if (id !== TARGET.id) progress.set(id, { ...p, dueInSessions: 8 })
  }
  progress.set(TARGET.id, {
    ...newProgress(TARGET.id), box: 3, stage: 'reviewing', ...overrides,
  })
  return progress
}

function runner(progress: Map<string, WordProgress>) {
  const onProgressChange = vi.fn<(p: WordProgress) => void>()
  const onComplete = vi.fn()
  render(
    <SessionRunner
      words={WORDS}
      initialProgress={progress}
      onProgressChange={onProgressChange}
      onComplete={onComplete}
      sessionLength={1}
    />,
  )
  return { onProgressChange, onComplete }
}

/** The choice buttons that are not the target -- a wrong tap each. */
function wrongChoices(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((b) => {
      const name = b.getAttribute('aria-label')
      return name !== null && name !== TARGET.text && !/hear/i.test(name)
    })
}

function lastReported(onProgressChange: { mock: { calls: unknown[][] } }): WordProgress {
  const calls = onProgressChange.mock.calls
  return calls[calls.length - 1][0] as WordProgress
}

function bodyText(): string {
  return document.body.textContent!.toLowerCase()
}

describe('a miss the child cannot see, that the engine still records', () => {
  it('increments lapses on a wrong tap without advancing the round', async () => {
    const { onProgressChange, onComplete } = runner(seeded())
    const wrong = wrongChoices()
    expect(wrong.length).toBeGreaterThan(0)

    await userEvent.click(wrong[0])

    const reported = lastReported(onProgressChange)
    expect(reported.wordId).toBe(TARGET.id)
    expect(reported.lapses).toBe(1)
    expect(reported.attempts).toBe(1)

    // The round is exactly where it was: same round, not resolved, and
    // no answer reported.
    expect(screen.getByTestId('round-counter')).toHaveTextContent('Round 1 of 1')
    expect(screen.queryByTestId('celebration')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows the child nothing that reads as failure, and leaves every button live', async () => {
    runner(seeded())
    await userEvent.click(wrongChoices()[0])

    for (const banned of FAILURE_WORDS) {
      expect(bodyText()).not.toContain(banned)
    }
    expect(bodyText()).not.toMatch(/score|points|\d+\s*\/\s*\d+\s*correct/)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeEnabled()
      expect(button).not.toHaveAttribute('aria-disabled')
    }
  })

  it(`flags the word as struggling after ${STRUGGLE_LAPSE_THRESHOLD} wrong taps`, async () => {
    const { onProgressChange } = runner(seeded())
    const wrong = wrongChoices()
    expect(wrong.length).toBeGreaterThanOrEqual(STRUGGLE_LAPSE_THRESHOLD)

    for (let i = 0; i < STRUGGLE_LAPSE_THRESHOLD; i++) {
      // Not flagged on the way up -- only the threshold'th miss flips it.
      if (i > 0) expect(lastReported(onProgressChange).struggling).toBe(false)
      await userEvent.click(wrong[i])
    }

    const reported = lastReported(onProgressChange)
    expect(reported.lapses).toBe(STRUGGLE_LAPSE_THRESHOLD)
    expect(reported.struggling).toBe(true)
    // Still the same round, and still no failure language.
    expect(screen.getByTestId('round-counter')).toHaveTextContent('Round 1 of 1')
    for (const banned of FAILURE_WORDS) {
      expect(bodyText()).not.toContain(banned)
    }
  })

  it('does not swap the game out from under the child when the flag flips', async () => {
    runner(seeded())
    const wrong = wrongChoices()
    for (let i = 0; i < STRUGGLE_LAPSE_THRESHOLD; i++) await userEvent.click(wrong[i])
    // Listen and Find's own container, still mounted and still holding
    // the same round.
    expect(screen.getByTestId('choices')).toBeInTheDocument()
    expect(screen.getByTestId('round-counter')).toHaveTextContent('Round 1 of 1')
  })

  it('resolves the round only on a correct answer, however many misses came first', async () => {
    const { onComplete } = runner(seeded())
    for (const button of wrongChoices()) await userEvent.click(button)
    expect(onComplete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: TARGET.text }))
    playOutClosing()
    expect(onComplete).toHaveBeenCalled()
  })
})

/**
 * What a miss costs. The review's measurement: `recordMiss` set
 * `box: 0`, so a word answered correctly a dozen times went back to the
 * very beginning on one wrong tap, and an ordinary child never finished
 * their first set because words fell faster than they climbed.
 *
 * A miss now costs one box, and only the first miss of a session costs
 * anything -- three wrong taps in a bad minute leave the word one box
 * down, not three.
 */
describe('what a miss costs', () => {
  it('costs one box, not everything', async () => {
    const { onProgressChange } = runner(seeded({ box: 5, stage: 'known' }))
    await userEvent.click(wrongChoices()[0])
    expect(lastReported(onProgressChange).box).toBe(4)
  })

  it('costs no more for the second and third miss of the same session', async () => {
    const { onProgressChange } = runner(seeded({ box: 5, stage: 'known' }))
    const wrong = wrongChoices()
    expect(wrong.length).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 3; i++) await userEvent.click(wrong[i])

    const reported = lastReported(onProgressChange)
    expect(reported.box).toBe(4)
    // Every miss is still counted, so the struggler rules still fire.
    expect(reported.lapses).toBe(3)
    expect(reported.struggling).toBe(true)
  })

  it('brings a word that slipped straight back', async () => {
    const { onProgressChange } = runner(seeded({ box: 5, stage: 'known' }))
    await userEvent.click(wrongChoices()[0])
    expect(lastReported(onProgressChange).dueInSessions).toBe(0)
  })
})
