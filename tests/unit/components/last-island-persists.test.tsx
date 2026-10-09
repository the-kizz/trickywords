import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { loadGuest, saveGuest } from '@/lib/guest/store'

const SETS = DEFAULT_SETS

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  window.history.pushState({}, '', '/play')
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ wordIds: [] }) })
  vi.stubGlobal('fetch', fetchMock)
})

/** The body of every POST the surface made to `/api/progress`. */
function postedBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/progress')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

/**
 * Where the child is has to be written down, not merely remembered.
 *
 * It came from React state alone, which is `undefined` after any reload,
 * so the map answered "the first island under the move-on threshold" --
 * Set 1 -- and put the companion, the pulse and the next session there
 * whatever the child had actually played.
 */
describe('the island they were on survives a reload', () => {
  it('is written when a family session starts', async () => {
    render(
      <FamilyPlay
        profileId={4} profileName="Robin" profileAvatar="avatar-fox"
        sets={SETS} initialProgress={{}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Set 7,/ }))
    expect(postedBodies()).toContainEqual({ profileId: 4, lastSetId: 7 })
  })

  it('is where a family map starts from on the next visit', () => {
    render(
      <FamilyPlay
        profileId={4} profileName="Robin" profileAvatar="avatar-fox"
        sets={SETS} initialProgress={{}} lastSetId={7}
      />,
    )
    expect(screen.getByRole('button', { name: /^Set 7, where you are/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /where you are/ })).toHaveLength(1)
  })

  it('is written to the guest record when a guest session starts', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={SETS} />)
    await userEvent.click(screen.getByRole('button', { name: /^Set 5,/ }))
    expect(loadGuest().lastSetId).toBe(5)
  })

  it('is where a guest map starts from after a refresh', () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: 5, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={SETS} />)
    expect(screen.getByRole('button', { name: /^Set 5, where you are/ })).toBeInTheDocument()
  })

  /** Guest state stays in sessionStorage: no cookie, no server write. */
  it('makes no server call and sets no cookie in guest mode', async () => {
    saveGuest({ avatar: 'fox', progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null, grownUp: null, startedAt: 1 })
    render(<GuestHome sets={SETS} />)
    await userEvent.click(screen.getByRole('button', { name: /^Set 5,/ }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
  })
})
