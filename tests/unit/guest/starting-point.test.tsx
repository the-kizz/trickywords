import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { loadGuest, saveGuest } from '@/lib/guest/store'
import { newProgress } from '@/lib/engine/ladder'
import { isSetFullyKnown } from '@/lib/engine/unlock'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { installClipHarness } from '../audio/clip-harness'
import type { WordProgress } from '@/lib/engine/types'

/**
 * "Already knows sets up to N", on the guest map.
 *
 * The public page is the one actually used, and a child part-way through
 * the year arrived on it as a beginner every time. The parent area has
 * always had a starting point for this; the guest map had nothing.
 */
const SETS = DEFAULT_SETS

beforeEach(() => {
  installClipHarness(() => {})
  saveGuest({ ...loadGuest(), avatar: 'fox' })
})

async function openMapAndPick(upTo: string) {
  render(<GuestHome sets={SETS} />)
  const picker = await screen.findByTestId('guest-starting-point')
  await userEvent.selectOptions(picker, upTo)
  return picker as HTMLSelectElement
}

describe('the guest starting point', () => {
  it('marks every word up to the chosen set as known', async () => {
    await openMapAndPick('6')
    const { progress } = loadGuest()
    for (const set of SETS) {
      const expectKnown = set.id <= 6
      expect(isSetFullyKnown(set.words, new Map(Object.entries(progress))), `Set ${set.id}`)
        .toBe(expectKnown)
    }
  })

  it('lands the map on the set after, where a child who knows 1-6 belongs', async () => {
    await openMapAndPick('6')
    await waitFor(() => expect(loadGuest().lastSetId).toBe(7))
  })

  it('shows what is known, whether that came from seeding or play', async () => {
    const picker = await openMapAndPick('3')
    await waitFor(() => expect(picker.value).toBe('3'))
  })

  /**
   * The difference from the family version, on purpose: a word already
   * met keeps its real progress. Family overwrites, which can erase a
   * `struggling` flag on a word a child is genuinely struggling with.
   */
  it('leaves a word that already has progress exactly as it was', async () => {
    const struggling: WordProgress = {
      ...newProgress('the'), box: 0, stage: 'learning', lapses: 3, struggling: true,
    }
    saveGuest({ ...loadGuest(), progress: { the: struggling } })
    await openMapAndPick('2')
    expect(loadGuest().progress.the).toEqual(struggling)
    // And its neighbours on the same set were seeded around it.
    expect(loadGuest().progress.my?.stage).toBe('known')
  })

  it('raises the high-water mark the companion is drawn from', async () => {
    await openMapAndPick('2')
    const known = Object.values(loadGuest().progress).filter((p) => p.stage === 'known').length
    expect(known).toBeGreaterThan(0)
    expect(loadGuest().bestKnown).toBe(known)
  })

  it('cannot un-know: choosing a lower set than shown changes nothing', async () => {
    const picker = await openMapAndPick('4')
    const before = loadGuest()
    await userEvent.selectOptions(picker, '2')
    expect(loadGuest().progress).toEqual(before.progress)
    await waitFor(() => expect(picker.value).toBe('4'))
  })

  it('is adult-sized and sits with the class picker, never on the child path', async () => {
    render(<GuestHome sets={SETS} />)
    const picker = await screen.findByTestId('guest-starting-point')
    expect(picker.style.minHeight).toBe('44px')
    expect(screen.getByTestId('guest-school-set')).toBeInTheDocument()
  })
})

