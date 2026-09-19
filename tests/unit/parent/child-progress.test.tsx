import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChildProgress } from '@/components/parent/ChildProgress'
import { ADULT_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress, MAX_BOX } from '@/lib/engine/ladder'
import type { Profile } from '@/lib/db/profiles'
import type { WordProgress } from '@/lib/engine/types'

const PROFILE: Profile = {
  id: 1, name: 'Robin', avatar: 'avatar-fox', createdAt: 0, bestKnown: 0,
}

const SETS = DEFAULT_SETS.slice(0, 2)

function progressFor(over: Record<string, Partial<WordProgress>>) {
  const out: Record<string, WordProgress> = {}
  for (const [id, o] of Object.entries(over)) {
    out[id] = { ...newProgress(id), ...o }
  }
  return out
}

function renderIt(progress: Record<string, WordProgress> = {}) {
  return render(
    <ChildProgress
      profile={PROFILE}
      sets={SETS}
      progress={progress}
      onChanged={vi.fn()}
    />,
  )
}

describe('the word list a parent reads', () => {
  /**
   * The step counts credits earned, not boxes occupied: box 3 is three
   * clean answers behind them, so it is step 3 of the five that take a
   * word to known.
   */
  it('gives each word its step and a plain sentence about it', () => {
    renderIt(progressFor({ the: { box: 3, stage: 'reviewing', attempts: 3 } }))
    const row = screen.getByText('the').closest('li')!
    expect(row.textContent).toContain(`Step 3 of ${MAX_BOX}`)
    expect(row.textContent).toMatch(/getting there/i)
  })

  /**
   * It read "Step 1 of 6 -- Not met yet", which is two claims about one
   * word and neither of them true.
   */
  it('says plainly when a word has not been started', () => {
    renderIt()
    const row = screen.getByText('the').closest('li')!
    expect(row.textContent).toContain('Not started')
    expect(row.textContent).not.toMatch(/step/i)
  })

  it('says a word they have played but not yet been credited for is just met', () => {
    renderIt(progressFor({ the: { box: 0, stage: 'learning', attempts: 2 } }))
    const row = screen.getByText('the').closest('li')!
    expect(row.textContent).toContain('Just met')
    expect(row.textContent).not.toMatch(/not started/i)
  })

  it('says "Known" rather than a step for a word at the top', () => {
    renderIt(progressFor({ the: { box: MAX_BOX, stage: 'known', attempts: 5 } }))
    const row = screen.getByText('the').closest('li')!
    expect(row.textContent).toContain('Known')
    expect(row.textContent).not.toMatch(/step/i)
  })

  it('never reports a word in raw ladder fields', () => {
    renderIt(progressFor({ the: { box: 2, lapses: 3, attempts: 9 } }))
    const row = screen.getByText('the').closest('li')!
    expect(row.textContent).not.toMatch(/lapse|attempt|streak|box/i)
  })
})

/**
 * The parent area is the one part of the app a child never uses, so it
 * works to the adult floor rather than the child one -- but it was
 * quietly *below* the adult floor: the disclosure rows were
 * `MIN_TARGET_PX / 2`, which is 38px and derived from the child figure
 * rather than from any guidance, and the tick boxes were 20x20.
 */
describe('adult-sized targets in the parent area', () => {
  it('gives every disclosure row the adult floor', () => {
    const { container } = renderIt()
    const summaries = container.querySelectorAll('summary')
    expect(summaries.length).toBeGreaterThan(0)
    for (const summary of summaries) {
      expect(summary).toHaveStyle({ minHeight: `${ADULT_TARGET_PX}px` })
    }
  })

  it('gives every starting-point tick box the adult floor', () => {
    renderIt()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(SETS.length)
    for (const box of boxes) {
      expect(box).toHaveStyle({
        width: `${ADULT_TARGET_PX}px`,
        height: `${ADULT_TARGET_PX}px`,
      })
    }
  })
})
