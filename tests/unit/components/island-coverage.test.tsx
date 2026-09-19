import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { MAX_NEW_WORDS_CREDITED } from '@/lib/engine/session'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound, roundsFinished, targetWord, totalRounds } from './answer'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The father's report, played out: a fresh Set 7 met three words and
 * never showed them `tall` or `little`. It shows all five now, and the
 * three the framework would introduce are the three that count.
 */

const SET7 = DEFAULT_SETS.find((s) => s.id === 7)!
const ISLAND_IDS = new Set(SET7.words.map((w) => w.id))
/** `all, call, ball` -- and then `tall, little`, the two he never saw. */
const CREDITED = SET7.words.slice(0, MAX_NEW_WORDS_CREDITED).map((w) => w.id)
const SHOWN_ONLY = SET7.words.slice(MAX_NEW_WORDS_CREDITED).map((w) => w.id)

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/** One clean sitting on a fresh Set 7, every round answered first time. */
async function playFreshSet7() {
  const onProgressChange = vi.fn<(p: WordProgress) => void>()
  render(
    <SessionRunner
      words={SET7.words}
      islandWordIds={ISLAND_IDS}
      initialProgress={new Map()}
      onProgressChange={onProgressChange}
      onComplete={vi.fn()}
    />,
  )

  const asked: string[] = []
  const total = totalRounds()
  for (let round = 0; round < total; round++) {
    if (roundsFinished()) break
    const word = targetWord()
    asked.push(word)
    playOutReveal()
    await answerRound(word)
    playOutClosing()
    await waitFor(() => expect(
      screen.queryByTestId('celebration')
        ?? screen.queryByTestId('say-it')
        ?? screen.getByTestId('round-counter'),
    ).toBeInTheDocument())
  }

  /** The last thing the session said about each word. */
  const latest = new Map<string, WordProgress>()
  for (const [p] of onProgressChange.mock.calls) latest.set(p.wordId, p)
  return { asked, latest }
}

describe('a first sitting on a fresh island', () => {
  it('shows every word on it, `tall` and `little` included', async () => {
    const { asked } = await playFreshSet7()
    for (const w of SET7.words) expect(asked).toContain(w.id)
  })

  it('promotes the three the framework would introduce', async () => {
    const { latest } = await playFreshSet7()
    for (const id of CREDITED) expect(latest.get(id)!.box).toBe(1)
  })

  it('holds the rest at box 0, with the round recorded in full', async () => {
    const { latest } = await playFreshSet7()
    for (const id of SHOWN_ONLY) {
      const p = latest.get(id)!
      expect(p.box).toBe(0)
      // Met, played, and unaided -- the attempt and the streak are the
      // evidence that tomorrow's credit rests on.
      expect(p.attempts).toBeGreaterThan(0)
      expect(p.correctStreak).toBeGreaterThan(0)
      // And not stamped as credited today, so tomorrow is free to.
      expect(p.lastCreditedOn).toBeNull()
    }
  })

  /**
   * The child must not be able to tell. The cap is on credit, and credit
   * is invisible everywhere else in this app too -- see the day floor.
   */
  it('tells them they were right either way', async () => {
    await playFreshSet7()
    const text = document.body.textContent!.toLowerCase()
    expect(text).not.toContain('wrong')
    expect(text).not.toMatch(/not yet|nearly|try harder/)
  })
})
