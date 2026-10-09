import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { loadGuest, saveGuest } from '@/lib/guest/store'

beforeEach(() => {
  sessionStorage.clear()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
})

describe('GuestHome', () => {
  it('never asks a child for their name', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/name/i)).toBeNull()
  })

  it('offers avatars to pick instead', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getAllByTestId(/^avatar-/).length).toBeGreaterThan(2)
  })

  it('remembers the chosen avatar for this tab', async () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getAllByTestId(/^avatar-/)[0])
    expect(loadGuest().avatar).not.toBeNull()
  })

  /**
   * "Start again" wipes the visit -- progress, avatar, companion -- with
   * nowhere to undo it from, so it takes two taps. The first only asks.
   *
   * This replaces the old single-tap assertion, which asserted exactly
   * the behaviour that made the control dangerous: the review measured
   * it 56px below the answer buttons of a live round, where one stray
   * finger destroyed a session. It is now on the map, and two-step.
   */
  it('asks before it starts again, so one tap cannot wipe the visit', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 3, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)

    await userEvent.click(screen.getByTestId('start-again-ask'))
    expect(loadGuest().avatar).toBe('fox')
    expect(loadGuest().bestKnown).toBe(3)
    expect(screen.getByTestId('start-again-confirm')).toBeInTheDocument()
  })

  it('offers Start again for the next child on a shared device, on the second tap', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 3, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByTestId('start-again-ask'))
    await userEvent.click(screen.getByTestId('start-again-confirm'))
    expect(loadGuest().avatar).toBeNull()
  })

  it('lets a child change their mind, keeping everything', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 3, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByTestId('start-again-ask'))
    await userEvent.click(screen.getByTestId('start-again-cancel'))
    expect(loadGuest().avatar).toBe('fox')
    expect(screen.getByTestId('start-again-ask')).toBeInTheDocument()
  })

  /**
   * The placement fix itself. The destructive control must not exist on
   * the screen a child is answering questions on.
   */
  it('keeps Start again off the session screen entirely', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByRole('button', { name: /^Set 1,/ }))
    await waitFor(
      () => expect(screen.getByTestId('round-counter')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(screen.queryByTestId('start-again')).toBeNull()
    expect(screen.queryByText(/start again/i)).toBeNull()
  })

  it('tells the visitor plainly that progress is not kept', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByText(/this device|this visit|not saved/i)).toBeInTheDocument()
  })
})
