import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordTile, trickyRuns } from '@/components/clay/WordTile'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { Word } from '@/lib/words/types'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'

/**
 * One heart per contiguous run of tricky graphemes.
 *
 * `trickyIndices` names graphemes, but a heart marks a *part of a word*.
 * Three of the fifty-six default words have two tricky graphemes side by
 * side -- `was` (w[a][s]), `are` ([a][re]), `were` (w[e][re]) -- and one
 * heart each drew two, close enough to fuse into one lumpy double shape:
 * `was` overlapped by 11px at 390px wide and 15px at 820px.
 *
 * Non-adjacent tricky graphemes keep their own hearts, which is correct
 * rather than a limitation: in `one`, `some` and `come` the o and the e
 * are separately irregular and are not one unit.
 */
const ALL: Word[] = DEFAULT_SETS.flatMap((s) => s.words)
const word = (text: string) => ALL.find((w) => w.text === text)!

/** Contiguous runs of tricky graphemes, worked out independently here. */
function runCount(w: Word): number {
  const tricky = [...w.trickyIndices].sort((a, b) => a - b)
  let runs = 0
  for (let i = 0; i < tricky.length; i++) {
    if (i === 0 || tricky[i] !== tricky[i - 1] + 1) runs++
  }
  return runs
}

const hearts = () => screen.queryAllByTestId(/^tricky-/)

describe.runIf(HEART_MARKS_ENABLED)('hearts over every default word', () => {
  it('draws exactly one per contiguous tricky run', () => {
    expect(ALL.length).toBeGreaterThan(0)
    for (const w of ALL) {
      const { unmount } = render(<WordTile word={w} showTricky size="lg" />)
      expect(hearts(), `${w.text} (tricky ${w.trickyIndices.join(',')})`)
        .toHaveLength(runCount(w))
      unmount()
    }
  })

  it('leaves every heart centred over its own run and nothing else', () => {
    for (const w of ALL) {
      const { unmount } = render(<WordTile word={w} showTricky size="lg" />)
      for (const heart of hearts()) {
        const run = heart.parentElement!
        const start = Number(heart.getAttribute('data-testid')!.replace('tricky-', ''))
        const expected = trickyRuns(w.graphemes, w.trickyIndices)
          .find((r) => r.start === start)!
        expect(run.textContent, w.text).toBe(expected.graphemes.join(''))
      }
      unmount()
    }
  })
})

describe.runIf(HEART_MARKS_ENABLED)('the three words with adjacent tricky graphemes', () => {
  it.each([['was', 'as'], ['are', 'are'], ['were', 'ere']])(
    '%s carries one heart, over its %s',
    (text, marked) => {
      const w = word(text)
      expect(w.trickyIndices.length).toBeGreaterThan(1)

      render(<WordTile word={w} showTricky size="lg" />)
      expect(hearts()).toHaveLength(1)
      expect(hearts()[0].parentElement!.textContent).toBe(marked)
    },
  )
})

describe.runIf(HEART_MARKS_ENABLED)('the three words with split tricky graphemes', () => {
  it.each(['one', 'some', 'come'])('%s keeps its two separate hearts', (text) => {
    render(<WordTile word={word(text)} showTricky size="lg" />)
    expect(hearts()).toHaveLength(2)
  })
})

/**
 * Geometry, at the narrowest viewport the app supports.
 *
 * jsdom does not lay text out, so the widths here come from a model: at
 * 390px the `lg` tile resolves `clamp(3rem, 8vw, 5.25rem)` to its 3rem
 * floor (8vw is 31.2px), the heart is `0.72em` of that, and each
 * character is given a deliberately *narrow* advance -- narrower than
 * Andika actually sets -- so the model under-states every gap and the
 * assertions are stricter than reality rather than more forgiving.
 */
const FONT_PX = 48
const HEART_PX = 0.72 * FONT_PX
/** A conservative lower bound on one character's advance width. */
const CHAR_PX = 0.45 * FONT_PX

const widthOf = (chars: string) => chars.length * CHAR_PX

/** Distance between the centres of two runs, given what lies between. */
function centreGap(before: string, between: string, after: string): number {
  return widthOf(before) / 2 + widthOf(between) + widthOf(after) / 2
}

describe('at 390px, the narrowest viewport', () => {
  it('leaves no two hearts overlapping on any default word', () => {
    for (const w of ALL) {
      const runs = trickyRuns(w.graphemes, w.trickyIndices)
      const tricky = runs.filter((r) => r.tricky)
      if (tricky.length < 2) continue

      for (let i = 1; i < tricky.length; i++) {
        const previous = tricky[i - 1]
        const current = tricky[i]
        const between = runs
          .filter((r) => r.start > previous.start && r.start < current.start)
          .flatMap((r) => r.graphemes)
          .join('')
        const gap = centreGap(
          previous.graphemes.join(''), between, current.graphemes.join(''),
        )
        expect(gap, `${w.text}: hearts ${previous.start} and ${current.start}`)
          .toBeGreaterThan(HEART_PX)
      }
    }
  })

  /**
   * And why the merge was needed rather than a smaller heart: two
   * graphemes side by side are closer together than one heart is wide,
   * so hearts on both of them could only ever overlap.
   */
  it('shows that a heart on each of two adjacent graphemes must overlap', () => {
    for (const text of ['was', 'are', 'were']) {
      const w = word(text)
      const tricky = [...w.trickyIndices].sort((a, b) => a - b)
      const first = w.graphemes[tricky[0]]
      const second = w.graphemes[tricky[1]]
      expect(centreGap(first, '', second), text).toBeLessThan(HEART_PX)
    }
  })
})

/**
 * The marks are off -- see `HEART_MARKS_ENABLED`. The describes above
 * assert the method when it is on; this asserts that it is off, so the
 * suite says which of the two is true today rather than falling silent.
 */
describe.runIf(!HEART_MARKS_ENABLED)('with the heart method switched off', () => {
  it('draws no heart, even where a caller asks for one', () => {
    for (const text of ['was', 'one', 'said']) {
      const { unmount } = render(<WordTile word={word(text)} showTricky size="lg" />)
      expect(hearts(), text).toHaveLength(0)
      unmount()
    }
  })

  it('still groups tricky graphemes into runs, ready for it coming back', () => {
    expect(trickyRuns(word('was').graphemes, word('was').trickyIndices)
      .filter((r) => r.tricky)).toHaveLength(1)
    expect(trickyRuns(word('one').graphemes, word('one').trickyIndices)
      .filter((r) => r.tricky)).toHaveLength(2)
  })
})
