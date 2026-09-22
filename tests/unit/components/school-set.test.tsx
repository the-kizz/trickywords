import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressMap } from '@/components/map/ProgressMap'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { GuestHome } from '@/components/guest/GuestHome'
import { ChildProgress } from '@/components/parent/ChildProgress'
import { getDb, type Db } from '@/lib/db/client'
import { createProfile, type Profile } from '@/lib/db/profiles'
import { getSchoolSetId, setSchoolSetId } from '@/lib/db/progress'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { loadGuest, saveGuest } from '@/lib/guest/store'
import type { WordProgress } from '@/lib/engine/types'

const EMPTY = new Map<string, WordProgress>()
const PROFILE: Profile = {
  id: 1, name: 'Robin', avatar: 'avatar-fox', createdAt: 0, bestKnown: 0,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  window.history.pushState({}, '', '/play')
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ wordIds: [] }) })
  vi.stubGlobal('fetch', fetchMock)
})

/**
 * "A parent might say oh class is up to level 7 let's practice level 7
 * then we can go back later. So visually should see where is meant to be
 * up to. But can override."
 *
 * Where the class is up to and where the child is are two different
 * facts, and the map has to show both at a glance. Free choice stays:
 * this marks an island and gates nothing.
 */
describe('the island the class is working on', () => {
  it('is marked on the map, distinctly from where the child is', () => {
    render(
      <ProgressMap
        sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}}
        currentSetId={2} schoolSetId={7} companionStage={0}
      />,
    )
    // Their island: the companion, and "where you are" in words.
    expect(screen.getByRole('button', { name: /^Set 2, where you are/ })).toBeInTheDocument()
    expect(screen.getByTestId('map-companion')).toBeInTheDocument()
    // The class's island: its own mark, and its own words.
    expect(screen.getByTestId('school-mark-7')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Set 7, your class is working on this one/ }),
    ).toBeInTheDocument()
  })

  it('leaves the map exactly as it was when no island is marked', () => {
    render(
      <ProgressMap
        sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}} currentSetId={2}
      />,
    )
    expect(document.querySelectorAll('[data-testid^="school-mark-"]')).toHaveLength(0)
    expect(document.body.textContent).not.toContain('School')
  })

  it('reads as both when the child is on the island the class is on', () => {
    render(
      <ProgressMap
        sets={DEFAULT_SETS} progress={EMPTY} onPickSet={() => {}}
        currentSetId={7} schoolSetId={7} companionStage={0}
      />,
    )
    expect(
      screen.getByRole('button', { name: /^Set 7, where you are, your class is working on this one/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('school-mark-7')).toBeInTheDocument()
  })

  /** Nothing in this app locks, and a marker is not a lock. */
  it('keeps every island tappable', async () => {
    const onPickSet = vi.fn()
    render(
      <ProgressMap
        sets={DEFAULT_SETS} progress={EMPTY} onPickSet={onPickSet} schoolSetId={7}
      />,
    )
    for (const button of screen.getAllByRole('button')) expect(button).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /^Set 11,/ }))
    expect(onPickSet).toHaveBeenCalledWith(11)
  })

  it('shows on the family map, and in the word list', () => {
    render(
      <FamilyPlay
        profileId={1} profileName="Robin" profileAvatar="avatar-fox"
        sets={DEFAULT_SETS} initialProgress={{}} lastSetId={2} schoolSetId={7}
      />,
    )
    expect(screen.getByTestId('school-mark-7')).toBeInTheDocument()
    expect(screen.getByTestId('island-words-school').closest('li')!.textContent)
      .toContain('Set 7')
  })
})

describe('a parent setting which set the class is on', () => {
  it('offers every set and a plain "not set"', () => {
    render(
      <ChildProgress
        profile={PROFILE} sets={DEFAULT_SETS} progress={{}} onChanged={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/class working on/i) as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map((o) => o.textContent))
      .toEqual(['Not set', ...DEFAULT_SETS.map((s) => s.name)])
  })

  it('saves the set the parent picks, for that child', async () => {
    const onChanged = vi.fn()
    render(
      <ChildProgress
        profile={PROFILE} sets={DEFAULT_SETS} progress={{}} onChanged={onChanged}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText(/class working on/i), '7')
    expect(fetchMock).toHaveBeenCalledWith('/api/parent', expect.objectContaining({
      body: JSON.stringify({ action: 'set-school-set', profileId: 1, setId: 7 }),
    }))
  })

  it('can unset it again', async () => {
    render(
      <ChildProgress
        profile={PROFILE} sets={DEFAULT_SETS} progress={{}} schoolSetId={7}
        onChanged={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/class working on/i) as HTMLSelectElement
    expect(select.value).toBe('7')
    await userEvent.selectOptions(select, '')
    expect(fetchMock).toHaveBeenCalledWith('/api/parent', expect.objectContaining({
      body: JSON.stringify({ action: 'set-school-set', profileId: 1, setId: null }),
    }))
  })
})

describe('where a family profile keeps it', () => {
  let db: Db
  let profileId: number

  beforeEach(() => {
    db = getDb(':memory:')
    profileId = createProfile(db, { name: 'Robin', avatar: 'fox' }).id
  })

  it('is unset until a parent says otherwise', () => {
    expect(getSchoolSetId(db, profileId)).toBeNull()
  })

  it('round-trips, per child, and can be cleared', () => {
    const other = createProfile(db, { name: 'Sam', avatar: 'owl' }).id
    setSchoolSetId(db, profileId, 7)
    setSchoolSetId(db, other, 3)
    expect(getSchoolSetId(db, profileId)).toBe(7)
    expect(getSchoolSetId(db, other)).toBe(3)
    setSchoolSetId(db, profileId, null)
    expect(getSchoolSetId(db, profileId)).toBeNull()
    expect(getSchoolSetId(db, other)).toBe(3)
  })
})

/**
 * Guest play has no parent area and no server, so a visiting parent gets
 * the same two things on the map itself -- inside the disclosure that is
 * closed until an adult opens it. Nothing leaves the tab.
 */
describe('the class marker in guest play', () => {
  it('is set on the map and kept for the visit', async () => {
    saveGuest({
      avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null,
      schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByText(/which words are on each island/i))
    await userEvent.selectOptions(screen.getByTestId('guest-school-set'), '7')
    expect(loadGuest().schoolSetId).toBe(7)
    expect(screen.getByTestId('school-mark-7')).toBeInTheDocument()
  })

  it('makes no server call and sets no cookie', async () => {
    saveGuest({
      avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null,
      schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByText(/which words are on each island/i))
    await userEvent.selectOptions(screen.getByTestId('guest-school-set'), '7')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
  })

  /** Whoever shared `?set=7` was saying "this is the set we are on". */
  it('is seeded by a shared link that names a set', async () => {
    window.history.pushState({}, '', '/play?set=7')
    saveGuest({
      avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null,
      schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await vi.waitFor(() => expect(loadGuest().schoolSetId).toBe(7))
  })

  it('never overrides a marker an adult has already set', async () => {
    window.history.pushState({}, '', '/play?set=7')
    saveGuest({
      avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null,
      schoolSetId: 3, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await vi.waitFor(() => expect(loadGuest().lastSetId).toBe(7))
    expect(loadGuest().schoolSetId).toBe(3)
  })

  it('shows it unset by default', () => {
    saveGuest({
      avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null,
      schoolSetId: null, grownUp: null, startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(document.querySelectorAll('[data-testid^="school-mark-"]')).toHaveLength(0)
  })
})
