import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressMap } from '@/components/map/ProgressMap'
import { GuestHome } from '@/components/guest/GuestHome'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { ADULT_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { saveGuest } from '@/lib/guest/store'

const EMPTY = new Map()

beforeEach(() => {
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
 * An (i) on each island, as asked for; a sheet with that island's words
 * when tapped. The long list of every island under the map is gone.
 */
describe('the words on each island, for the adult', () => {
  it('puts an (i) on every island, and nothing is open until one is tapped', () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} />)
    for (const set of DEFAULT_SETS) {
      expect(screen.getByTestId(`island-info-${set.id}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('island-words')).toBeNull()
  })

  it('shows that island\'s words, and only that island\'s, on a tap', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} />)
    await userEvent.click(screen.getByTestId('island-info-7'))
    const sheet = screen.getByTestId('island-words')
    const text = sheet.textContent ?? ''
    expect(text).toContain('Set 7')
    for (const word of DEFAULT_SETS[6].words) expect(text).toContain(word.text)
    for (const word of DEFAULT_SETS[0].words) expect(text).not.toContain(` ${word.text},`)
  })

  it('is a label, not a control: tapping the (i) does not start the island', async () => {
    const onPickSet = vi.fn()
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={onPickSet} />)
    await userEvent.click(screen.getByTestId('island-info-3'))
    expect(onPickSet).not.toHaveBeenCalled()
  })

  it('closes on Done, and on Escape', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} />)
    await userEvent.click(screen.getByTestId('island-info-3'))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('island-words')).toBeNull()
    await userEvent.click(screen.getByTestId('island-info-3'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('island-words')).toBeNull()
  })

  it('gives the adult controls adult-sized targets', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} />)
    const info = screen.getByTestId('island-info-1')
    expect(info.style.minHeight).toBe(`${ADULT_TARGET_PX}px`)
    expect(info.style.minWidth).toBe(`${ADULT_TARGET_PX}px`)
    await userEvent.click(info)
    expect(screen.getByRole('button', { name: 'Done' }).style.minHeight).toBe(`${ADULT_TARGET_PX}px`)
  })

  it('marks where the child is, in words', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} currentSetId={7} />)
    await userEvent.click(screen.getByTestId('island-info-7'))
    expect(screen.getByTestId('island-words-here')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByTestId('island-info-2'))
    expect(screen.queryByTestId('island-words-here')).toBeNull()
  })

  it('marks the island the class is on when one has been set', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} schoolSetId={7} />)
    await userEvent.click(screen.getByTestId('island-info-7'))
    expect(screen.getByTestId('island-words-school')).toBeInTheDocument()
  })

  it('marks nothing about school when no island has been set', async () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} schoolSetId={null} />)
    await userEvent.click(screen.getByTestId('island-info-7'))
    expect(screen.queryByTestId('island-words-school')).toBeNull()
  })

  /** The long list is gone from both maps; the (i)s are on both. */
  it('is on the guest map, with no list of every island under it', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByTestId('island-info-1')).toBeInTheDocument()
    expect(screen.queryByText(/which words are on each island/i)).toBeNull()
    expect(screen.queryByTestId('session-focus')).toBeNull()
  })

  it('is on the family map too', async () => {
    render(
      <FamilyPlay
        profileId={1} profileName="Robin" profileAvatar="avatar-fox"
        sets={DEFAULT_SETS} initialProgress={{}} lastSetId={3}
      />,
    )
    await userEvent.click(screen.getByTestId('island-info-3'))
    expect(screen.getByTestId('island-words-here')).toBeInTheDocument()
    expect(screen.queryByText(/which words are on each island/i)).toBeNull()
  })

  /** The (i) never claims to be an island. */
  it('leaves exactly twelve things claiming to be an island', () => {
    render(<ProgressMap sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^Set \d+,/ })).toHaveLength(12)
  })
})

describe('the adult set-up on the guest map', () => {
  it('holds both pickers, closed, beside the switch rather than under the islands', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    const setup = screen.getByTestId('grown-up-setup')
    expect(setup).not.toHaveAttribute('open')
    expect(setup.contains(screen.getByTestId('guest-starting-point'))).toBe(true)
    expect(setup.contains(screen.getByTestId('guest-school-set'))).toBe(true)
    const firstIsland = screen.getByRole('button', { name: /^Set 1,/ })
    expect(setup.compareDocumentPosition(firstIsland) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
