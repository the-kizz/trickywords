import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { saveGuest } from '@/lib/guest/store'
import { newProgress } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

beforeEach(() => {
  sessionStorage.clear()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  window.history.pushState({}, '', '/play')
})

/** Every word in the collection met, and none of them due for a while. */
function nothingDue(): Record<string, WordProgress> {
  const out: Record<string, WordProgress> = {}
  for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
    out[w.id] = { ...newProgress(w.id), box: 4, stage: 'reviewing', dueInSessions: 8 }
  }
  return out
}

/**
 * The map used to say "Nothing much is due today, so this will be a
 * short go." It was false in both directions: computed after the cap on
 * review from other islands, so an island whose own words were all known
 * while ten words were due elsewhere got three rounds *and* the note --
 * and it said "today" about a schedule counted in sessions. The operator
 * objected to the sentence the first time he saw it.
 *
 * A short go needs no explanation. The round pips already show how many
 * rounds there are, and a wrong explanation is worse than none.
 */
describe('the map explains nothing about how long the go will be', () => {
  it('says nothing about a short go when nothing much is due', () => {
    saveGuest({
      avatar: 'fox', progress: nothingDue(), bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByTestId('short-session-note')).toBeNull()
    expect(document.body.textContent).not.toMatch(/short go|nothing much is due/i)
  })

  it('says nothing about it to a fresh visitor either', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByTestId('short-session-note')).toBeNull()
    expect(document.body.textContent).not.toMatch(/short go|nothing much is due/i)
  })

  /** And "Mix it up" is gone: review is no longer something to ask for. */
  it('offers no "Mix it up" button anywhere', () => {
    saveGuest({
      avatar: 'fox', progress: nothingDue(), bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByRole('button', { name: /mix it up/i })).toBeNull()
  })
})
