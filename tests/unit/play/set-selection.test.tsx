import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { saveGuest } from '@/lib/guest/store'

beforeEach(() => {
  sessionStorage.clear()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  window.history.pushState({}, '', '/play')
})

/**
 * `?set=N` drops a visitor straight into that set's first round.
 *
 * It used to land on the game chooser instead, and a child had to get
 * past that before playing anything. There is no chooser any more --
 * with two round types there is nothing to choose between, and the seven
 * tiles were seven pictures of the same activity -- so a shared link now
 * does exactly what it says.
 */
describe('/play honours ?set=N', () => {
  it('drops a returning visitor with an avatar straight into that set', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    window.history.pushState({}, '', '/play?set=3')
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('round-counter')).toBeInTheDocument()
  })

  it('ignores an out-of-range set number and shows the map instead', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    window.history.pushState({}, '', '/play?set=999')
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByTestId('round-counter')).toBeNull()
    expect(screen.getByRole('group', { name: /word set map/i })).toBeInTheDocument()
  })

  it('a fresh visitor picks an avatar first, then jumps to the requested set', async () => {
    window.history.pushState({}, '', '/play?set=2')
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getAllByTestId(/^avatar-/)[0])
    expect(screen.getByTestId('round-counter')).toBeInTheDocument()
  })

  it('never introduces a word from a set the child has not reached', () => {
    // With no progress yet, the pool is exactly that set's words --
    // `sessionPool` never reaches into a later set.
    saveGuest({ avatar: 'owl', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    window.history.pushState({}, '', '/play?set=1')
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('round-counter')).toHaveTextContent('1')
  })

  it('lets a child leave the session for the map without finishing it', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    window.history.pushState({}, '', '/play?set=3')
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByTestId('session-back'))
    expect(screen.getByRole('group', { name: /word set map/i })).toBeInTheDocument()
    expect(screen.queryByTestId('round-counter')).toBeNull()
  })
})
