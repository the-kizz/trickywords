import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardRun } from '@/components/family/CardRun'
import { readingSummary } from '@/lib/parent/summary'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress, recordReadToAdult, recordSaidIt } from '@/lib/engine/ladder'
import { ADULT_TARGET_PX } from '@/lib/constants'
import { wordAudioUrl } from '@/lib/audio/manifest'
import { installClipHarness } from '../audio/clip-harness'
import type { Word } from '@/lib/words/types'

/**
 * The school's own routine, and deliberately not a game: "shuffle Tricky
 * Word Cards and present again". A parent who wants to know what the
 * teacher will find out on Friday should not have to play a session of
 * matching games to learn it.
 */
const SET = DEFAULT_SETS[0]

let played: string[] = []

beforeEach(() => {
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => { vi.useRealTimers() })

const run = (over: Partial<Parameters<typeof CardRun>[0]> = {}) =>
  render(<CardRun words={SET.words} onRead={vi.fn()} onDone={vi.fn()} {...over} />)

describe('going through the cards', () => {
  it('shows one word at a time, and never says it', () => {
    run()
    expect(screen.getByTestId('card-run-word')).toBeInTheDocument()
    expect(screen.getByText(`Card 1 of ${SET.words.length}`)).toBeInTheDocument()
    expect(played.join(' ')).toBe('')
  })

  it('is the adult who answers, at an adult size', () => {
    run()
    for (const name of ['They read it', 'Tell them the word']) {
      expect(screen.getByRole('button', { name }).style.minHeight)
        .toBe(`${ADULT_TARGET_PX}px`)
    }
  })

  it('reports each card as read alone or told, and moves on', async () => {
    const onRead = vi.fn<(w: Word, alone: boolean) => void>()
    run({ onRead })

    await userEvent.click(screen.getByRole('button', { name: 'They read it' }))
    expect(onRead.mock.calls[0][1]).toBe(true)
    expect(screen.getByText(`Card 2 of ${SET.words.length}`)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tell them the word' }))
    expect(onRead.mock.calls[1][1]).toBe(false)
    // Telling them means they hear it -- that is what telling them is.
    expect(played.join(' ')).toContain(wordAudioUrl(onRead.mock.calls[1][0].audioId))
  })

  it('goes through the whole island, then counts what they read alone', async () => {
    run()
    for (let i = 0; i < SET.words.length; i++) {
      await userEvent.click(screen.getByRole('button', {
        name: i === 0 ? 'Tell them the word' : 'They read it',
      }))
    }
    expect(screen.getByTestId('card-run-done')).toBeInTheDocument()
    expect(screen.getByText(`${SET.words.length - 1} of ${SET.words.length} read on their own`))
      .toBeInTheDocument()
  })

  it('can be stopped part-way, because a five-year-old can stop', async () => {
    const onDone = vi.fn()
    run({ onDone })
    await userEvent.click(screen.getByRole('button', { name: 'Stop the cards' }))
    expect(onDone).toHaveBeenCalled()
  })

  /**
   * The deck is what a child would otherwise learn instead of the words.
   * `sort(() => Math.random() - 0.5)` leans towards the original order,
   * which is the one thing shuffling here is for.
   */
  it('does not keep dealing the island in its own order', () => {
    const orders = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { unmount } = run()
      orders.add(screen.getByTestId('card-run-word').textContent!)
      unmount()
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('says nothing that reads as a mark or a failure', () => {
    run()
    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'score', 'failed']) {
      expect(body).not.toContain(banned)
    }
  })
})

/**
 * The promise `WordProgress.saidIt` has made since it was added -- "a
 * parent should be able to see that it happened" -- which nothing in the
 * parent area kept until now.
 */
describe('what a parent is told about their reading', () => {
  const word = () => newProgress(SET.words[0].id)

  it('says nothing at all when nobody has heard them read it', () => {
    expect(readingSummary(word())).toBe('')
    expect(readingSummary(undefined)).toBe('')
  })

  it('distinguishes reading to a grown-up from reading to themselves', () => {
    expect(readingSummary(recordReadToAdult(word()))).toContain('to you once')
    const alone = readingSummary(recordSaidIt(word()))
    expect(alone).toContain('to themselves')
    expect(alone).toContain('you have not heard this one yet')
  })

  it('counts both when both have happened', () => {
    let p = recordReadToAdult(recordReadToAdult(word()))
    p = recordSaidIt(p)
    expect(readingSummary(p)).toBe('Read aloud to you 2 times, and to themselves once.')
  })
})
