import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound, roundsFinished, targetWord, totalRounds } from './answer'

/**
 * Item 6's second half: the app promises every session ends on a
 * success, and used to only plan to. The closing word was the strongest
 * word at plan time, so one measured sitting ended on the word the child
 * had missed in round 8 -- a miss, then a prompted correct, then "All
 * done!".
 *
 * The closing word is now chosen when the session reaches that round,
 * from what has actually gone well.
 */

const WORDS = DEFAULT_SETS[0].words
/**
 * A ceiling, not a promise: all five of Set 1 are due at box 0, so the
 * session runs five rounds and the last of them is the closing one.
 */
const LENGTH = 9

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/** A choice that is not the word being asked for. */
function aWrongChoice(word: string) {
  return screen.getAllByRole('button').find((b) => {
    const name = b.getAttribute('aria-label')
    return name !== null && !/hear|back/i.test(name) && name.toLowerCase() !== word
  })
}

/**
 * Plays a session through, missing once in the round given by
 * `missInRound`, and reports what happened.
 */
async function playSession(missInRound: number) {
  render(
    <SessionRunner
      words={WORDS}
      initialProgress={new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))}
      onProgressChange={vi.fn()}
      onComplete={vi.fn()}
     
      sessionLength={LENGTH}
    />,
  )

  const answeredWell: string[] = []
  const missed: string[] = []
  let closing = ''

  const total = totalRounds()
  for (let round = 0; round < total; round++) {
    if (roundsFinished()) break
    const word = targetWord()
    playOutReveal()

    const isLast = round === total - 1
    if (isLast) closing = word

    if (round === missInRound && !isLast) {
      const wrong = aWrongChoice(word)
      expect(wrong, 'no wrong choice to tap').toBeDefined()
      await userEvent.click(wrong!)
      missed.push(word)
    }

    await answerRound(word)
    playOutClosing()
    if (!isLast) answeredWell.push(word)

    await waitFor(() => expect(
      screen.queryByTestId('celebration') ?? screen.getByTestId('round-counter'),
    ).toBeInTheDocument())
  }

  return { answeredWell, missed, closing }
}

describe('the word a session ends on', () => {
  it('is one the child has answered well in this very session', async () => {
    const { answeredWell, closing } = await playSession(-1)
    expect(answeredWell.length).toBeGreaterThan(0)
    expect(answeredWell).toContain(closing)
  })

  it('is never the word they have just missed', async () => {
    const { missed, closing, answeredWell } = await playSession(0)
    expect(missed).toHaveLength(1)
    expect(closing).not.toBe(missed[0])
    // And it is still a word that went well, not merely a different one.
    expect(answeredWell).toContain(closing)
  })

  it('is never the word the round before it asked for', async () => {
    render(
      <SessionRunner
        words={WORDS}
        initialProgress={new Map(WORDS.map((w) => [w.id, newProgress(w.id)]))}
        onProgressChange={vi.fn()}
        onComplete={vi.fn()}
       
        sessionLength={LENGTH}
      />,
    )
    const asked: string[] = []
    const total = totalRounds()
    for (let round = 0; round < total; round++) {
      if (roundsFinished()) break
      asked.push(targetWord())
      playOutReveal()
      await answerRound(asked[asked.length - 1])
      playOutClosing()
      await waitFor(() => expect(
        screen.queryByTestId('celebration') ?? screen.getByTestId('round-counter'),
      ).toBeInTheDocument())
    }
    const backToBack = asked.filter((w, i) => i > 0 && w === asked[i - 1])
    expect(backToBack).toEqual([])
  })
})

/**
 * The closing round used to *replace* the last planned round, so a fresh
 * island's first sitting -- the one session where meeting new words is
 * the entire point -- promised "I, the, my" and asked I, the, I. Two new
 * words out of three, on the first thing a new child ever sees.
 *
 * It is appended now, and it may only repeat a word this session has
 * already asked for.
 */
describe('the closing round costs the session nothing', () => {
  const island = DEFAULT_SETS[0].words
  const elsewhere = DEFAULT_SETS[6].words

  /** Set 7 known and not due; Set 1 never met. */
  function progress() {
    const m = new Map(elsewhere.map((w) => [w.id, {
      ...newProgress(w.id), box: 5, stage: 'known' as const, dueInSessions: 8,
    }]))
    return m
  }

  async function playFreshIsland() {
    render(
      <SessionRunner
        words={[...elsewhere, ...island]}
        islandWordIds={new Set(island.map((w) => w.id))}
        initialProgress={progress()}
        onProgressChange={vi.fn()}
        onComplete={vi.fn()}
        sessionLength={LENGTH}
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
    return asked
  }

  /**
   * Was "all three new words": three was the coverage cap then, and the
   * defect was that the closing round ate one of them. The island is
   * shown whole now (see `MAX_NEW_WORDS_CREDITED`), so the same
   * assertion is that the closing round costs the sitting none of the
   * five.
   */
  it('asks for every new word on the island, not one fewer', async () => {
    const asked = await playFreshIsland()
    const newWords = asked.filter((id) => island.some((w) => w.id === id))
    expect(new Set(newWords).size).toBe(island.length)
  })

  it('ends on a word this session has already asked for', async () => {
    const asked = await playFreshIsland()
    const closing = asked[asked.length - 1]
    expect(asked.slice(0, -1)).toContain(closing)
    // And never a strong word from an island they did not play tonight.
    expect(elsewhere.some((w) => w.id === closing)).toBe(false)
  })
})
