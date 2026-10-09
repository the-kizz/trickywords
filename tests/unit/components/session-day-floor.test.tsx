import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { dayKey, newProgress } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'

const WORDS = DEFAULT_SETS[0].words

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * `recordCorrect` takes the day rather than reading a clock, so that the
 * ladder stays a pure function of its inputs -- and so the day floor
 * only actually bites if a play surface passes one. This is the test the
 * comment on `recordCorrect` promises: the session does.
 */
describe('the session applies the day floor', () => {
  it('stamps today on a word it promoted', async () => {
    const start = new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))
    // Everything but `my` parked, so the session is one round on it, and
    // `struggling` keeps that round a Find it.
    for (const [id, p] of start) {
      if (id !== 'my') start.set(id, { ...p, dueInSessions: 8 })
    }
    start.set('my', { ...start.get('my')!, struggling: true })

    const onProgressChange = vi.fn<(p: WordProgress) => void>()
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={start}
        onProgressChange={onProgressChange}
        onComplete={vi.fn()}
        sessionLength={1}
      />,
    )
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()

    const reported = onProgressChange.mock.calls
      .map(([p]) => p)
      .find((p) => p.wordId === 'my')!
    expect(reported.box).toBe(1)
    expect(reported.lastCreditedOn).toBe(dayKey())
  })

  /** A word already credited today plays exactly as normal, and holds. */
  it('holds the box of a word already credited today', async () => {
    const start = new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))
    for (const [id, p] of start) {
      if (id !== 'my') start.set(id, { ...p, dueInSessions: 8 })
    }
    start.set('my', {
      ...start.get('my')!, box: 2, stage: 'learning',
      struggling: true, lastCreditedOn: dayKey(),
    })

    const onProgressChange = vi.fn<(p: WordProgress) => void>()
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={start}
        onProgressChange={onProgressChange}
        onComplete={vi.fn()}
        sessionLength={1}
      />,
    )
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()

    const reported = onProgressChange.mock.calls
      .map(([p]) => p)
      .find((p) => p.wordId === 'my')!
    expect(reported.box).toBe(2)
    // And they were still told they were right: the attempt and the streak
    // are both recorded, and nothing on screen said otherwise.
    expect(reported.attempts).toBe(1)
    expect(reported.correctStreak).toBe(1)
    expect(document.body.textContent!.toLowerCase()).not.toContain('wrong')
  })
})
