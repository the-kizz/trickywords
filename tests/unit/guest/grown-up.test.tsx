import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { loadGuest, saveGuest, GUEST_KEY } from '@/lib/guest/store'
import { GROWN_UP_DEFAULT } from '@/lib/teaching'
import { recordCardRead, newProgress, BOX_INTERVALS } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { installClipHarness } from '../audio/clip-harness'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The switch a parent actually reaches.
 *
 * Guest play is the public surface, and it is the one being used in
 * practice -- so a Read it round that only ever appeared behind the
 * family map was a round nobody met. It needs no server: guest progress
 * already holds the same `WordProgress` records, in this tab's
 * sessionStorage.
 */
const SETS = DEFAULT_SETS

beforeEach(() => {
  sessionStorage.clear()
  installClipHarness(() => {})
})

afterEach(() => { vi.useRealTimers() })

describe('a grown-up on the guest surface', () => {
  it('is assumed to be there, because that is how this is used', () => {
    expect(GROWN_UP_DEFAULT).toBe(true)
    // Nothing stored yet: the derived answer is the default, and the
    // stored field stays null so the default can change later without
    // every saved visit carrying the old one.
    expect(loadGuest().grownUp).toBeNull()
  })

  it('offers the switch on the map, and remembers being turned off', async () => {
    render(<GuestHome sets={SETS} />)
    // Past the avatar step.
    await userEvent.click(screen.getAllByRole('button')[0])
    await waitFor(() => expect(screen.getByTestId('grown-up-toggle')).toBeInTheDocument())

    const toggle = screen.getByTestId('grown-up-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(true)

    await userEvent.click(toggle)
    await waitFor(() => expect(loadGuest().grownUp).toBe(false))
    // Persisted as a deliberate choice, not expired -- both states last
    // until changed.
    expect(JSON.parse(sessionStorage.getItem(GUEST_KEY)!).grownUp).toBe(false)
  })

  it('offers the card run only while a grown-up is there', async () => {
    render(<GuestHome sets={SETS} />)
    await userEvent.click(screen.getAllByRole('button')[0])
    await waitFor(() => expect(screen.getByTestId('grown-up-toggle')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /Go through/ })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('grown-up-toggle'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Go through/ })).toBeNull())
  })

  it('keeps a turned-off switch across a reload of the same tab', () => {
    saveGuest({ ...loadGuest(), avatar: 'fox', grownUp: false })
    expect(loadGuest().grownUp).toBe(false)
  })
})

/**
 * One implementation of what a card is worth, shared by both surfaces --
 * two copies would drift, and a fix to one would leave the other
 * scoring an island differently.
 */
describe('what a card in a card run is worth', () => {
  const word = (over: Partial<WordProgress> = {}): WordProgress =>
    ({ ...newProgress('said'), box: 3, stage: 'reviewing', ...over })

  it('credits a word read unaided, and counts the reading', () => {
    const after = recordCardRead(word(), true, '2026-09-22')
    expect(after.box).toBe(4)
    expect(after.readToAdult).toBe(1)
    expect(after.lastCreditedOn).toBe('2026-09-22')
  })

  it('records being told as a miss, so the cards can cost a word too', () => {
    const before = word()
    const after = recordCardRead(before, false, '2026-09-22')
    expect(after.box).toBe(before.box - 1)
    expect(after.lapses).toBe(before.lapses + 1)
    expect(after.readToAdult).toBe(0)
  })

  /**
   * A card run is an assessment taken outside the sessions, and no
   * `decrementDue` pass follows it. Resetting the interval here would
   * push these words further out every evening until they stopped
   * coming back as review at all.
   */
  it('leaves the review schedule exactly where the sessions left it', () => {
    const before = word({ dueInSessions: 2 })
    expect(recordCardRead(before, true, '2026-09-22').dueInSessions).toBe(2)
    expect(recordCardRead(before, false, '2026-09-22').dueInSessions).toBe(2)
    // And it is genuinely untouched, not coincidentally equal to what
    // the ladder would have set.
    expect(BOX_INTERVALS[4]).not.toBe(2)
  })

  it('cannot be run up the ladder by going through the deck twice', () => {
    const first = recordCardRead(word(), true, '2026-09-22')
    const second = recordCardRead(first, true, '2026-09-22')
    expect(second.box).toBe(first.box)
    // The reading still counted, though -- it did happen.
    expect(second.readToAdult).toBe(2)
  })
})
