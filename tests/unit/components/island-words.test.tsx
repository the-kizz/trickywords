import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IslandWords } from '@/components/map/IslandWords'
import { GuestHome } from '@/components/guest/GuestHome'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { ADULT_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { saveGuest } from '@/lib/guest/store'

beforeEach(() => {
  sessionStorage.clear()
  window.history.pushState({}, '', '/play')
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ wordIds: [] }),
  }))
})

/**
 * "A parent might say oh class is up to level 7 let's practice level 7
 * then we can go back later... Which is why a tooltip with the words
 * shown for each level is important."
 *
 * The need is a parent holding the sheet the school sent, looking for
 * the island that holds those words -- before tapping anything. The form
 * is not a tooltip: no hover on a tablet, nothing tappable inside an
 * island a child taps to play, and nothing for a pre-reader to read
 * where they are looking.
 */
describe('the words on each island, for the adult', () => {
  it('names every island and every one of its words', () => {
    render(<IslandWords sets={DEFAULT_SETS} />)
    const text = screen.getByTestId('island-words').textContent ?? ''
    for (const set of DEFAULT_SETS) {
      expect(text).toContain(set.name)
      for (const word of set.words) expect(text).toContain(word.text)
    }
  })

  /** Closed until an adult opens it: the child's map is not a page of text. */
  it('is closed until it is opened', () => {
    render(<IslandWords sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('island-words')).not.toHaveAttribute('open')
  })

  it('opens on a tap, not on hover', async () => {
    render(<IslandWords sets={DEFAULT_SETS} />)
    const summary = screen.getByText(/which words are on each island/i)
    await userEvent.click(summary)
    expect(screen.getByTestId('island-words')).toHaveAttribute('open')
  })

  it('gives the adult control an adult-sized target', () => {
    render(<IslandWords sets={DEFAULT_SETS} />)
    const summary = screen.getByText(/which words are on each island/i)
    expect(summary.style.minHeight).toBe(`${ADULT_TARGET_PX}px`)
  })

  it('marks where the child is, in words', () => {
    render(<IslandWords sets={DEFAULT_SETS} hereId={7} />)
    const row = screen.getByTestId('island-words-here').closest('li')!
    expect(row.textContent).toContain('Set 7')
  })

  it('marks the island the class is on when one has been set', () => {
    render(<IslandWords sets={DEFAULT_SETS} hereId={2} schoolSetId={7} />)
    expect(screen.getByTestId('island-words-school').closest('li')!.textContent)
      .toContain('Set 7')
  })

  it('marks nothing about school when no island has been set', () => {
    render(<IslandWords sets={DEFAULT_SETS} hereId={2} schoolSetId={null} />)
    expect(screen.queryByTestId('island-words-school')).toBeNull()
  })

  /**
   * It replaces the "This time: was, said, you" line: two adult lines
   * under the map competed for one glance, and the old line named the
   * session's words -- review from other islands included -- which is
   * not something a parent can match against a sheet from school.
   */
  it('is the only adult word line on the map', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('island-words')).toBeInTheDocument()
    expect(screen.queryByTestId('session-focus')).toBeNull()
  })

  it('is on the family map too', () => {
    render(
      <FamilyPlay
        profileId={1} profileName="Robin" profileAvatar="avatar-fox"
        sets={DEFAULT_SETS} initialProgress={{}} lastSetId={3}
      />,
    )
    expect(screen.getByTestId('island-words')).toBeInTheDocument()
    expect(screen.getByTestId('island-words-here').closest('li')!.textContent)
      .toContain('Set 3')
  })

  /** An island is the control a child taps to play; this adds no other. */
  it('puts no second tappable thing inside an island', () => {
    render(
      <FamilyPlay
        profileId={1} profileName="Robin" profileAvatar="avatar-fox"
        sets={DEFAULT_SETS} initialProgress={{}}
      />,
    )
    expect(screen.getByTestId('island-words').querySelectorAll('button')).toHaveLength(0)
    // Twelve islands, and nothing else claiming to be one.
    expect(screen.getAllByRole('button', { name: /^Set \d+,/ })).toHaveLength(12)
  })
})
