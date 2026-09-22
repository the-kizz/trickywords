import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { saveGuest } from '@/lib/guest/store'
import { newProgress, MAX_BOX } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

beforeEach(() => {
  sessionStorage.clear()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  window.history.pushState({}, '', '/play')
})

/** Every word in the collection at the top of the ladder. */
function everythingKnown(): Record<string, WordProgress> {
  const out: Record<string, WordProgress> = {}
  for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
    out[w.id] = {
      ...newProgress(w.id), box: MAX_BOX, stage: 'known', dueInSessions: 16,
    }
  }
  return out
}

/**
 * The twelfth island completing is the finish line, and this screen is
 * the only end the app has. The sticker book used to carry that job --
 * eleven pictures whose last one meant "you know them all" -- and it was
 * a second reward system keyed off the very count the companion already
 * uses.
 */
describe('the finish line', () => {
  it('is absent while there is still an island to finish', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByTestId('know-them-all')).toBeNull()
  })

  it('appears once every island is finished', () => {
    saveGuest({
      avatar: 'fox', progress: everythingKnown(), bestKnown: 56, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('know-them-all')).toBeVisible()
    expect(screen.getByText(/you know them all/i)).toBeInTheDocument()
  })

  /** Said as well as written: a pre-reader gets nothing from silent text. */
  it('is spoken as well as written', () => {
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play
    saveGuest({
      avatar: 'fox', progress: everythingKnown(), bestKnown: 56, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(play).toHaveBeenCalled()
  })

  /** Nothing closes. A child who knows them all may still want to play. */
  it('leaves every island tappable underneath it', () => {
    saveGuest({
      avatar: 'fox', progress: everythingKnown(), bestKnown: 56, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    const islands = screen.getByRole('group', { name: /word set map/i })
      .querySelectorAll('button')
    expect(islands).toHaveLength(DEFAULT_SETS.length)
    for (const island of islands) expect(island).toBeEnabled()
  })
})
