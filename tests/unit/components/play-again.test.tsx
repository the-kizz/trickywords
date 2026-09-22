import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { dayKey, newProgress } from '@/lib/engine/ladder'
import { saveGuest, loadGuest } from '@/lib/guest/store'
import { PHRASES } from '@/lib/audio/manifest'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound, roundsFinished, targetWord, totalRounds } from './answer'
import type { WordProgress } from '@/lib/engine/types'

/**
 * "Again", and an end to the day.
 *
 * A child had to return to the map and tap the same island a second time
 * to keep going, which is asking a five-year-old to go backwards to go
 * forwards. "Again" is the big control on the celebration now; the map
 * is the quiet one. And once every word on the island has been credited
 * today, the celebration says so once -- truthfully, and without
 * refusing them another go.
 */

const SET7 = DEFAULT_SETS.find((s) => s.id === 7)!

beforeEach(() => {
  sessionStorage.clear()
  window.history.pushState({}, '', '/play')
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/** Every word on Set 7 met, due, and credited on `creditedOn`. */
function set7At(box: number, creditedOn: string | null): Record<string, WordProgress> {
  const out: Record<string, WordProgress> = {}
  for (const w of SET7.words) {
    out[w.id] = {
      ...newProgress(w.id),
      box,
      stage: box >= 3 ? 'reviewing' : 'learning',
      dueInSessions: 0,
      attempts: 4,
      lastCreditedOn: creditedOn,
    }
  }
  return out
}

async function startSet7(progress: Record<string, WordProgress>) {
  saveGuest({
    avatar: 'fox', progress, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
  })
  render(<GuestHome sets={DEFAULT_SETS} />)
  await userEvent.click(screen.getByRole('button', { name: /^Set 7,/ }))
}

/** Plays whatever go is on screen through to the celebration. */
async function playToCelebration(): Promise<string[]> {
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
  // The say-it round sits between the last round and the celebration.
  if (screen.queryByTestId('say-it') !== null) {
    await userEvent.click(screen.getByRole('button', { name: 'I said that' }))
  }
  await waitFor(() => expect(screen.getByTestId('celebration')).toBeInTheDocument())
  return asked
}

describe('the celebration offers another go', () => {
  it('makes Again the big control and the map the quiet one', async () => {
    await startSet7(set7At(2, null))
    await playToCelebration()

    const again = screen.getByTestId('again-button')
    const toMap = screen.getByTestId('continue-button')
    expect(again).toBeInTheDocument()
    // The map is still reachable, and it now says where it goes.
    expect(toMap).toHaveTextContent(/map/i)
    // Again carries the weight: the filled play colour, the map an outline.
    expect(again.className).toContain('bg-play')
    expect(toMap.className).not.toContain('bg-play')
  })

  it('never puts a child target under 76px', async () => {
    await startSet7(set7At(2, null))
    await playToCelebration()
    for (const id of ['again-button', 'continue-button']) {
      const el = screen.getByTestId(id)
      expect(el.style.minHeight).toBe('76px')
      expect(el.style.minWidth).toBe('76px')
    }
  })

  it('starts a fresh go on the same island without going via the map', async () => {
    await startSet7(set7At(2, null))
    await playToCelebration()

    await userEvent.click(screen.getByTestId('again-button'))

    // Back in a round, not on the map: the island tiles are gone.
    await waitFor(() => expect(screen.getByTestId('round-counter')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Set 1,/ })).toBeNull()
    // And on the island they were already on.
    expect(loadGuest().lastSetId).toBe(7)
    expect(SET7.words.map((w) => w.id)).toContain(targetWord())
  })

  it('leaves for the map only when the map control is tapped', async () => {
    await startSet7(set7At(2, null))
    await playToCelebration()
    await userEvent.click(screen.getByTestId('continue-button'))
    await waitFor(() => expect(
      screen.getByRole('button', { name: /^Set 7,/ }),
    ).toBeInTheDocument())
  })
})

describe('an end to the day, that is not a door closing', () => {
  /**
   * A first sitting on a fresh island is the case that proves it says
   * only what is true: the island is covered in full, but the words past
   * the credit cap are not credited today, so there is work left on it
   * and the line stays away.
   */
  it('says nothing about today while there is still work on the island', async () => {
    await startSet7({})
    await playToCelebration()
    expect(screen.queryByTestId('todays-words-done')).toBeNull()
    // And Again is still the way on.
    expect(screen.getByTestId('again-button')).toBeInTheDocument()
  })

  it('says so, once, when every word on the island was credited today', async () => {
    // Credited today already, so the day floor holds every box: this go
    // is practice and there is nothing left today that can move one.
    await startSet7(set7At(3, dayKey()))
    await playToCelebration()

    const line = screen.getByTestId('todays-words-done')
    expect(line).toHaveTextContent(PHRASES.todaysWordsDone)
    expect(screen.getAllByTestId('todays-words-done')).toHaveLength(1)
  })

  it('still offers another go when it has said it', async () => {
    await startSet7(set7At(3, dayKey()))
    await playToCelebration()
    expect(screen.getByTestId('todays-words-done')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('again-button'))
    await waitFor(() => expect(screen.getByTestId('round-counter')).toBeInTheDocument())
  })

  /**
   * The copy has to be true. It must not congratulate a child for
   * stopping, and it must not tell them they are finished while "Again" is
   * still there and still works.
   */
  it('does not congratulate them for stopping, or claim they are finished', () => {
    const line = PHRASES.todaysWordsDone.toLowerCase()
    expect(line).not.toMatch(/bed|goodbye|bye|see you|come back|finished|all done/)
    expect(line).toMatch(/play again/)
  })

  it('has a spoken equivalent for every line the celebration shows', () => {
    expect(PHRASES.todaysWordsDone).toBeTruthy()
    expect(PHRASES.again).toBeTruthy()
  })
})
