import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
 * The map has to say where the child is, on arrival and not only after
 * they have played something. The companion sits on that island, which is
 * the same thing said twice over -- once in words for a screen reader,
 * once as a picture for a five-year-old.
 */
describe('where the child is on the map', () => {
  it('marks the current island in words, before anything is played', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(
      screen.getByRole('button', { name: /^Set 1, where you are/ }),
    ).toBeInTheDocument()
  })

  it('marks exactly one island as current', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getAllByRole('button', { name: /where you are/ })).toHaveLength(1)
  })

  it('sits the companion on that island rather than above the map', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    const companion = screen.getByTestId('map-companion')
    const island = screen.getByRole('button', { name: /^Set 1, where you are/ })
    expect(companion.parentElement).toBe(island.parentElement)
  })
})
