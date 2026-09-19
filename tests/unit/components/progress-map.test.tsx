import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressMap } from '@/components/map/ProgressMap'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

const EMPTY_PROGRESS = new Map<string, WordProgress>()

/**
 * A school sends different children home on different sets. Every set
 * must be reachable from day one — there is no "locked" concept here.
 */
describe('ProgressMap', () => {
  it('renders all twelve sets as enabled, tappable controls', () => {
    render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(DEFAULT_SETS.length)
    for (const button of buttons) {
      expect(button).toBeEnabled()
      expect(button).not.toHaveAttribute('aria-disabled')
    }
  })

  it('calls onPickSet for a set the child has not started', async () => {
    const onPickSet = vi.fn()
    render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={onPickSet} />,
    )
    const targetSet = DEFAULT_SETS[6] // Set 7 — a mid-sequence set nobody has touched
    await userEvent.click(screen.getByRole('button', { name: new RegExp(targetSet.name) }))
    expect(onPickSet).toHaveBeenCalledWith(targetSet.id)
  })

  it('gives every island at least the child touch-target floor', () => {
    render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveStyle({ minWidth: '76px', minHeight: '76px' })
    }
  })

  it('names a not-started set in its accessible name', () => {
    render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    const set9 = DEFAULT_SETS[8]
    expect(
      screen.getByRole('button', { name: new RegExp(`${set9.name}, not started`) }),
    ).toBeInTheDocument()
  })

  it('names a finished set in its accessible name', () => {
    const set1 = DEFAULT_SETS[0]
    const progress = new Map<string, WordProgress>()
    for (const word of set1.words) {
      progress.set(word.id, {
        wordId: word.id, stage: 'known', box: 5, dueInSessions: 99,
        correctStreak: 5, attempts: 5, lapses: 0, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
      })
    }
    render(<ProgressMap sets={DEFAULT_SETS} progress={progress} onPickSet={() => {}} />)
    expect(
      screen.getByRole('button', { name: new RegExp(`${set1.name}, finished`) }),
    ).toBeInTheDocument()
  })

  it('gives each set its own island picture, 1-12 in the supplied order', () => {
    const { container } = render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    const images = [...container.querySelectorAll('img')]
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      '/islands/island-01-flag.webp',
      '/islands/island-02-star.webp',
      '/islands/island-03-house.webp',
      '/islands/island-04-tree.webp',
      '/islands/island-05-lighthouse.webp',
      '/islands/island-06-tent.webp',
      '/islands/island-07-windmill.webp',
      '/islands/island-08-hot-air-balloon.webp',
      '/islands/island-09-kite.webp',
      '/islands/island-10-rainbow.webp',
      '/islands/island-11-treasure-chest.webp',
      '/islands/island-12-castle-tower.webp',
    ])
  })

  it('keeps the island art decorative, so it never doubles the accessible name', () => {
    const { container } = render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    // The button's aria-label already says the set name and its state.
    // An announced picture on top of that would read the set out twice.
    for (const img of container.querySelectorAll('img')) {
      expect(img).toHaveAttribute('alt', '')
    }
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('shows the same island picture whichever state a set is in', () => {
    // State is carried by the icon, the border style and the fill --
    // never by the artwork. A child who finished Set 1 must still
    // recognise Set 1 by its island.
    const set1 = DEFAULT_SETS[0]
    const finished = new Map<string, WordProgress>()
    for (const word of set1.words) {
      finished.set(word.id, {
        wordId: word.id, stage: 'known', box: 5, dueInSessions: 99,
        correctStreak: 5, attempts: 5, lapses: 0, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
      })
    }

    function firstIslandSrc(progress: Map<string, WordProgress>): string | null {
      const { container, unmount } = render(
        <ProgressMap sets={DEFAULT_SETS} progress={progress} onPickSet={() => {}} />,
      )
      const src = container.querySelector('img')?.getAttribute('src') ?? null
      unmount()
      return src
    }

    expect(firstIslandSrc(finished)).toBe(firstIslandSrc(EMPTY_PROGRESS))
    expect(firstIslandSrc(finished)).toBe('/islands/island-01-flag.webp')
  })

  it('renders a set with no island art rather than a broken picture', () => {
    // Set ids are any positive integer (`wordSetSchema`) and a parent
    // can add sets in the parent area, so there is no guarantee every
    // set has artwork. A set beyond the twelve must still be tappable.
    const extra = { ...DEFAULT_SETS[0], id: 99, name: 'Set 99' }
    const { container } = render(
      <ProgressMap sets={[extra]} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: /Set 99, where you are, not started/ }),
    ).toBeEnabled()
  })

  /**
   * The third of the three states, and the one with no words of its own:
   * "in progress" was dropped from the name because the counts that
   * follow say it better and say more -- how many are known, how many are
   * being learned, how many have not been met at all.
   */
  it('names an in-progress set by its counts rather than by a state word', () => {
    const set2 = DEFAULT_SETS[1]
    const progress = new Map<string, WordProgress>([
      [set2.words[0].id, {
        wordId: set2.words[0].id, stage: 'learning', box: 2, dueInSessions: 1,
        correctStreak: 1, attempts: 2, lapses: 0, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
      }],
    ])
    render(<ProgressMap sets={DEFAULT_SETS} progress={progress} onPickSet={() => {}} />)
    // Set 2 is also where they are: with no island stored, the map's guess
    // is the furthest island they have actually touched (see `currentSet`),
    // which is exactly this one.
    const button = screen.getByRole('button', { name: new RegExp(`^${set2.name}, where you are,`) })
    const name = button.getAttribute('aria-label')!
    expect(name).toContain('0 of 5 words known')
    expect(name).toContain('1 being learned')
    expect(name).toContain('4 not met yet')
    expect(name).not.toContain('in progress')
  })
})

/**
 * Twelve islands are 2100px tall on a phone: 9 of the 14 controls sat
 * below the fold with nothing to say so. The map now brings the island
 * the child is on into view when it loads.
 */
describe('ProgressMap scrolls to where the child is', () => {
  const scrollIntoView = vi.fn()

  afterEach(() => {
    scrollIntoView.mockClear()
  })

  function withScrollSpy(render: () => void): HTMLElement | null {
    const original = Element.prototype.scrollIntoView
    let calledOn: HTMLElement | null = null
    Element.prototype.scrollIntoView = function spy(this: Element) {
      calledOn = this as HTMLElement
      scrollIntoView()
    }
    try {
      render()
    } finally {
      Element.prototype.scrollIntoView = original
    }
    return calledOn
  }

  it('scrolls to the set the child last played', () => {
    const target = DEFAULT_SETS[6]
    const el = withScrollSpy(() =>
      render(
        <ProgressMap
          sets={DEFAULT_SETS}
          progress={EMPTY_PROGRESS}
          onPickSet={() => {}}
          currentSetId={target.id}
        />,
      ),
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(el!.getAttribute('aria-label')).toMatch(new RegExp(`^${target.name},`))
  })

  it('otherwise scrolls to the first set they have not finished', () => {
    const progress = new Map<string, WordProgress>()
    for (const word of DEFAULT_SETS[0].words) {
      progress.set(word.id, {
        wordId: word.id, stage: 'known', box: 5, dueInSessions: 16,
        correctStreak: 3, attempts: 3, lapses: 0, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
      })
    }
    const el = withScrollSpy(() =>
      render(<ProgressMap sets={DEFAULT_SETS} progress={progress} onPickSet={() => {}} />),
    )
    expect(el!.getAttribute('aria-label')).toMatch(/^Set 2,/)
  })

  /**
   * The wave that makes the islands read as a winding path is switched
   * off below three columns in CSS, because there it put Set 4 above
   * Set 3. The offsets are therefore handed to CSS as custom
   * properties rather than applied as inline layout, which is what the
   * container query needs in order to be able to ignore them.
   */
  it('hands the wave to CSS rather than positioning the islands itself', () => {
    const { container } = render(
      <ProgressMap sets={DEFAULT_SETS} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
    )
    const islands = container.querySelectorAll('.island')
    expect(islands.length).toBe(DEFAULT_SETS.length)
    for (const island of islands) {
      const style = (island as HTMLElement).style
      expect(style.getPropertyValue('--island-rise')).not.toBe('')
      expect(style.getPropertyValue('--island-lean')).not.toBe('')
      // Nothing is positioned from here.
      expect(style.marginTop).toBe('')
      expect(style.justifySelf).toBe('')
    }
    expect(container.querySelector('.island-map')).not.toBeNull()
  })

  /**
   * A child plays a set, moves three words up the ladder, and the island
   * still reads "0/5" -- because a word counts as known only at the top
   * box. The operator hit exactly this: "I played a few. Still shows as
   * 0. Can you see I played?" The exact number is for the adult and
   * stays exact; what changed is that work in progress is now visible
   * behind it.
   */
  describe('an island shows work done, not only work finished', () => {
    const set1 = DEFAULT_SETS[0]

    const started = (box: number): Map<string, WordProgress> =>
      new Map(set1.words.map((w) => [w.id, {
        wordId: w.id, box, stage: box >= 5 ? 'known' : 'learning',
        dueInSessions: 0, correctStreak: 0, attempts: 1, lapses: 0, struggling: false,
      } as WordProgress]))

    it('still reports the exact known count, which is zero', () => {
      render(<ProgressMap sets={DEFAULT_SETS} progress={started(2)} onPickSet={() => {}} />)
      expect(screen.getByRole('button', { name: new RegExp(`${set1.name},.*0 of ${set1.words.length} words known`) }))
        .toBeInTheDocument()
    })

    it('tells an adult how many are being learned', () => {
      render(<ProgressMap sets={DEFAULT_SETS} progress={started(2)} onPickSet={() => {}} />)
      expect(screen.getByRole('button', { name: new RegExp(`${set1.words.length} being learned`) }))
        .toBeInTheDocument()
    })

    /**
     * The bar and the `known/total` pill are both gone: one mark per
     * word replaces them, and a first sitting turns every mark it
     * touched pale. See `tests/unit/components/island-marks.test.tsx`
     * for the whole of that, and `markFor` for why a count was the wrong
     * idea for this card.
     */
    it('shows a mark per word rather than a bar or a count', () => {
      render(<ProgressMap sets={[set1]} progress={started(1)} onPickSet={() => {}} />)
      expect(screen.queryByTestId(`island-progress-${set1.id}`)).toBeNull()
      expect(screen.queryByTestId(`island-progress-fill-${set1.id}`)).toBeNull()
      const marks = screen.getByTestId(`island-marks-${set1.id}`)
      expect(marks.querySelectorAll('[data-mark]')).toHaveLength(set1.words.length)
      // No count anywhere a child looks. The set's own name is a name,
      // not a number; what is gone is `0/5`.
      expect(screen.getByRole('button').textContent)
        .not.toMatch(new RegExp(`\\d\\s*/\\s*${set1.words.length}`))
      expect(screen.getByRole('button').textContent).toBe(set1.name)
    })

    it('deepens a mark as its word climbs the ladder', () => {
      const marksAt = (box: number) => {
        const { container, unmount } = render(
          <ProgressMap sets={[set1]} progress={started(box)} onPickSet={() => {}} />,
        )
        const marks = [...container.querySelectorAll('[data-mark]')]
          .map((m) => m.getAttribute('data-mark'))
        unmount()
        return marks
      }
      expect(marksAt(1)).toEqual(Array(set1.words.length).fill('started'))
      expect(marksAt(3)).toEqual(Array(set1.words.length).fill('nearly'))
      expect(marksAt(5)).toEqual(Array(set1.words.length).fill('known'))
    })

    it('fills nothing for an untouched set', () => {
      const { container } = render(
        <ProgressMap sets={[set1]} progress={EMPTY_PROGRESS} onPickSet={() => {}} />,
      )
      expect(container.querySelector('span[style*="width"]')).toBeNull()
    })
  })
})
