import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressMap, markFor } from '@/components/map/ProgressMap'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress, recordCorrect, MAX_BOX } from '@/lib/engine/ladder'
import { saveGuest } from '@/lib/guest/store'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The island card, one mark per word.
 *
 * It used to make two claims about a set and the louder one was wrong:
 * a bar a fifth full, and `0/5` beside it. A word counts as known only
 * at the top box, so a child could play for a week and still be shown a
 * zero -- reported as broken three times ("I played a few. Still shows
 * as 0. Can you see I played?"). The count was not the thing to fix;
 * showing only completion was.
 */

const SET1 = DEFAULT_SETS[0] // five words
const SET3 = DEFAULT_SETS[2] // seven words -- the widest island there is

const at = (set: typeof SET1, boxes: Record<string, number>): Map<string, WordProgress> => {
  const m = new Map<string, WordProgress>()
  for (const w of set.words) {
    const box = boxes[w.id]
    if (box === undefined) continue
    m.set(w.id, {
      ...newProgress(w.id),
      box,
      stage: box >= MAX_BOX ? 'known' : 'learning',
      attempts: 1,
    })
  }
  return m
}

const marks = (setId: number) =>
  [...screen.getByTestId(`island-marks-${setId}`).querySelectorAll('[data-mark]')]
    .map((m) => m.getAttribute('data-mark'))

describe('what each mark claims', () => {
  it('is hollow for a word never met', () => {
    expect(markFor(undefined)).toBe('not-met')
  })

  /**
   * Box 0 is met. A word the island showed but did not credit (see
   * `MAX_NEW_WORDS_CREDITED`) has been played, and the mark says so --
   * which is what turns five marks pale on a fresh island's first
   * sitting.
   */
  it('is pale for a met word, from box 0 through box 2', () => {
    for (const box of [0, 1, 2]) {
      expect(markFor({ ...newProgress('the'), box })).toBe('started')
    }
  })

  it('is deep at boxes 3 and 4 -- nearly, and not yet claimed', () => {
    for (const box of [3, 4]) {
      expect(markFor({ ...newProgress('the'), box })).toBe('nearly')
    }
  })

  /** The one mark that claims "known", so the card cannot overstate. */
  it('is solid only at the top box', () => {
    expect(markFor({ ...newProgress('the'), box: MAX_BOX, stage: 'known' })).toBe('known')
    expect(markFor({ ...newProgress('the'), box: MAX_BOX - 1 })).not.toBe('known')
  })

  /**
   * A self-report is not evidence, and a mark for it would look like
   * some. `saidIt` moves nothing.
   */
  it('is unmoved by the child saying they read it', () => {
    const said = { ...newProgress('the'), box: 1, saidIt: 4 }
    expect(markFor(said)).toBe('started')
  })
})

describe('the card', () => {
  it('draws one mark per word, in set order', () => {
    render(<ProgressMap sets={[SET3]} progress={new Map()} onPickSet={() => {}} />)
    expect(marks(SET3.id)).toHaveLength(SET3.words.length)
  })

  it('keeps a word on the same mark every day, whatever its progress', () => {
    const progress = at(SET3, { said: 5, he: 3, we: 1 })
    render(<ProgressMap sets={[SET3]} progress={progress} onPickSet={() => {}} />)
    // `said, are, he, she, me, be, we` -- the third is `he`, the last `we`.
    expect(marks(SET3.id)).toEqual([
      'known', 'not-met', 'nearly', 'not-met', 'not-met', 'not-met', 'started',
    ])
  })

  it('carries no number where a child looks', () => {
    const progress = at(SET1, { i: 5, the: 2 })
    render(<ProgressMap sets={[SET1]} progress={progress} onPickSet={() => {}} />)
    expect(screen.getByRole('button').textContent).toBe(SET1.name)
  })

  /** The counts are for the adult, and they stay exact. */
  it('puts the counts in the accessible name and nowhere else', () => {
    const progress = at(SET1, { i: 5, the: 2, my: 2 })
    render(<ProgressMap sets={[SET1]} progress={progress} onPickSet={() => {}} />)
    const name = screen.getByRole('button').getAttribute('alt')
      ?? screen.getByRole('button').getAttribute('aria-label')!
    expect(name).toContain('1 of 5 words known')
    expect(name).toContain('2 being learned')
    expect(name).toContain('2 not met yet')
  })

  /** Seven marks at 12px with a 4px gap are 108px inside a 128px card. */
  it('sizes the marks so the widest island fits across the card', () => {
    render(<ProgressMap sets={[SET3]} progress={new Map()} onPickSet={() => {}} />)
    const row = screen.getByTestId(`island-marks-${SET3.id}`)
    for (const mark of row.querySelectorAll('[data-mark]')) {
      expect(mark.className).toContain('w-3')
      expect(mark.className).toContain('h-3')
    }
    expect(row.className).toContain('gap-1')
    // Row and marks are decoration: the name carries all of it in words.
    expect(row.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows every mark solid on a finished island, and nothing else', () => {
    const progress = at(SET1, Object.fromEntries(SET1.words.map((w) => [w.id, 5])))
    render(<ProgressMap sets={[SET1]} progress={progress} onPickSet={() => {}} />)
    expect(marks(SET1.id)).toEqual(Array(SET1.words.length).fill('known'))
    expect(screen.getByRole('button').getAttribute('aria-label'))
      .toContain('finished')
  })

  it('shows every mark hollow on an island never touched', () => {
    render(<ProgressMap sets={[SET1]} progress={new Map()} onPickSet={() => {}} />)
    expect(marks(SET1.id)).toEqual(Array(SET1.words.length).fill('not-met'))
  })
})

/**
 * The question the operator kept asking, answered end to end: play a
 * sitting, come back to the map, and the marks have moved.
 */
describe('can you see I played?', () => {
  it('turns a word\'s mark pale the first time it is answered', () => {
    const before = at(SET1, {})
    const { unmount } = render(
      <ProgressMap sets={[SET1]} progress={before} onPickSet={() => {}} />,
    )
    expect(marks(SET1.id)).toEqual(Array(SET1.words.length).fill('not-met'))
    unmount()

    // One correct, unaided answer on `the` -- and one on `my` that the
    // credit cap held at box 0. Both are met; both marks move.
    const after = new Map(before)
    after.set('the', recordCorrect(newProgress('the'), false, '2026-09-18'))
    after.set('my', recordCorrect(newProgress('my'), false, '2026-09-18', false))
    render(<ProgressMap sets={[SET1]} progress={after} onPickSet={() => {}} />)
    const moved = marks(SET1.id)
    expect(moved[1]).toBe('started')
    expect(moved[2]).toBe('started')
    expect(moved[0]).toBe('not-met')
  })

  it('shows the marks on the real map a child arrives at', async () => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/play')
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.pause = vi.fn()
    saveGuest({
      avatar: 'fox',
      progress: Object.fromEntries(at(SET1, { i: 5, the: 1 })),
      bestKnown: 1,
      lastSetId: 1,
      schoolSetId: null,
      startedAt: 1,
    })
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(marks(SET1.id).slice(0, 2)).toEqual(['known', 'started'])
    // And the pill and the bar are gone from the surface a child sees.
    expect(screen.queryByTestId(`island-progress-${SET1.id}`)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${SET1.name},`) }))
  })
})
