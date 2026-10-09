import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeartWordBuilder } from '@/components/games/HeartWordBuilder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import { playOutReveal, withRevealTimers } from './reveal'
import { answered } from './celebration'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'

const said = DEFAULT_SETS.flatMap((s) => s.words).find((w) => w.text === 'said')!
// said = s / ai / d, tricky at index 1

const round = (): Round => ({
  word: said, distractors: [],
  support: supportFor(newProgress('said')), box: 0, isFinal: false,
})

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * Render, then play out the reveal. At the errorless support level the
 * round opens on the whole written word alone while it is spoken; the
 * tiles arrive only once it has faded, so building it is reproducing a
 * form the child is holding rather than copying one off the screen.
 */
function asking(ui: ReactElement) {
  const result = render(ui)
  playOutReveal()
  return result
}

describe('HeartWordBuilder', () => {
  it('offers a tile for every grapheme in the word', () => {
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    for (const g of said.graphemes) {
      expect(screen.getAllByRole('button', { name: g }).length).toBeGreaterThan(0)
    }
  })

  /**
   * The round used to open on nothing: a word built from no graphemes
   * renders as nothing, so a child saw an unreadable instruction, a
   * speaker and a row of tiles with a blank gap between them. The empty
   * slots are what say "three pieces go here, left to right" without
   * saying which.
   */
  it('shows an empty slot for every grapheme still to be placed', () => {
    const { container } = render(
      <HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />,
    )
    const slots = () => within(screen.getByTestId('built')).queryAllByRole('presentation', { hidden: true }).length
      || container.querySelectorAll('[data-testid="built"] span[aria-hidden="true"]').length
    expect(slots()).toBe(said.graphemes.length)
  })

  it('fills one slot for each grapheme placed', async () => {
    const { container } = asking(
      <HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />,
    )
    const slots = () =>
      container.querySelectorAll('[data-testid="built"] span[aria-hidden="true"]').length
    expect(slots()).toBe(said.graphemes.length)
    await userEvent.click(screen.getAllByRole('button', { name: said.graphemes[0] })[0])
    expect(slots()).toBe(said.graphemes.length - 1)
  })

  /**
   * As in Listen and Find: the celebration here is the word and then
   * "Well done!", and the round used to hand over the moment the last
   * grapheme landed, so the next word appeared over the top of it.
   */
  it('holds the round open until the celebration has finished', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    expect(onAnswer).not.toHaveBeenCalled()
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('completes the word when graphemes are tapped in order', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('is tap-only — no tile is draggable', () => {
    const { container } = asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    for (const b of container.querySelectorAll('button')) {
      expect(b.getAttribute('draggable')).not.toBe('true')
    }
  })

  it('ignores an out-of-order tap instead of failing the child', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'd' })[0])
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByTestId('built')).toHaveTextContent('')
  })

  /**
   * Scoped to the built word. This round is at box 0, so the shared
   * round header now also shows the heart-marked prompt word above the
   * tiles -- the errorless support that used to exist in Listen and
   * Find only -- and that carries a heart of its own.
   */
  it.runIf(HEART_MARKS_ENABLED)('shows a heart over the tricky grapheme once it is placed', async () => {
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    const built = () => within(screen.getByTestId('built'))
    expect(built().queryByTestId('tricky-1')).toBeNull()

    await userEvent.click(screen.getAllByRole('button', { name: 's' })[0])
    await userEvent.click(screen.getAllByRole('button', { name: 'ai' })[0])
    expect(built().getByTestId('tricky-1')).toBeInTheDocument()
  })

  it('leaves the first request to hear the word unprompted', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('marks the answer prompted once the child has heard the word twice', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  function tileOrder(container: HTMLElement) {
    const tiles = container.querySelector('[data-testid="tiles"]')!
    return [...tiles.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
  }

  it('shuffles tile order between different rounds for the same word', () => {
    const { container: c1 } = asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    const { container: c2 } = asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    expect(tileOrder(c1)).not.toEqual(tileOrder(c2))
  })

  it('keeps tile order stable across re-renders of the same round', () => {
    const r = round()
    const { container, rerender } = asking(<HeartWordBuilder round={r} onAnswer={() => {}} onMiss={() => {}} />)
    const before = tileOrder(container)
    rerender(<HeartWordBuilder round={r} onAnswer={() => {}} onMiss={() => {}} />)
    expect(tileOrder(container)).toEqual(before)
  })
})

/**
 * Item 7 of the gameplay review: a tap on a decoy tile counted as a
 * miss. A child working out which pieces are even in play is exploring,
 * not failing -- and a fumble among seven tiles (`little` is l / i / tt
 * / le plus three decoys) used to cost the word a box and count towards
 * the struggler threshold.
 *
 * Only a real grapheme of this word, reached for out of order, is a
 * misread now. The decoys stay: they are what makes the child attend to
 * which piece is which.
 */
describe('exploring is not failing', () => {
  const graphemes = said.graphemes

  const decoyTiles = () =>
    screen.getAllByRole('button')
      .filter((b) => {
        const name = b.getAttribute('aria-label')
        return name !== null && !/hear/i.test(name) && !graphemes.includes(name)
      })

  it('still offers decoys to tell apart', () => {
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    expect(decoyTiles().length).toBeGreaterThan(0)
  })

  it('does not report a tap on a decoy as a miss', async () => {
    const onMiss = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={onMiss} />)
    for (const tile of decoyTiles()) await userEvent.click(tile)
    expect(onMiss).not.toHaveBeenCalled()
  })

  it('does not let a decoy tap cost the child their unaided answer', async () => {
    const onAnswer = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={onAnswer} onMiss={() => {}} />)
    await userEvent.click(decoyTiles()[0])
    for (const g of graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('still reports a grapheme of the word placed out of order', async () => {
    const onMiss = vi.fn()
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={onMiss} />)
    // The word's own last piece, reached for first.
    await userEvent.click(
      screen.getAllByRole('button', { name: graphemes[graphemes.length - 1] })[0],
    )
    expect(onMiss).toHaveBeenCalled()
  })

  it('shows the child nothing either way', async () => {
    asking(<HeartWordBuilder round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    const before = document.body.textContent
    await userEvent.click(decoyTiles()[0])
    expect(document.body.textContent).toBe(before)
    for (const button of screen.getAllByRole('button')) expect(button).toBeEnabled()
  })
})
