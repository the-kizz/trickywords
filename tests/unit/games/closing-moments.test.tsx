import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { CHEST_REVEAL_BOX, CHEST_REVEAL_MS } from '@/components/games/ChestReveal'
import { SENTENCE_BOX } from '@/components/games/SentenceMoment'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import { sentenceAudioUrl } from '@/lib/audio/manifest'
import type { Round } from '@/lib/engine/session'
import { PAST_SENTENCE_MS, playOutReveal, withRevealTimers } from './reveal'
import { answered } from './celebration'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!
const go = ALL.find((w) => w.text === 'go')!

/**
 * A round at a given box. Support is taken from a progress record at
 * that box, so the round is exactly the one the engine would build.
 */
const round = (box: number): Round => ({
  word: said,
  distractors: [go],
  support: supportFor({ ...newProgress('said'), box }),
  box,
  isFinal: false,
})

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

function playRound(box: number, onAnswer = vi.fn()) {
  render(<ListenAndFind round={round(box)} onAnswer={onAnswer} onMiss={() => {}} />)
  playOutReveal()
  return onAnswer
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('the chest', () => {
  it('does not open on a word the child has only just met', async () => {
    playRound(CHEST_REVEAL_BOX - 1)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(screen.queryByTestId('chest-reveal')).not.toBeInTheDocument()
  })

  it('opens on a correct answer once the word is being reviewed', async () => {
    playRound(CHEST_REVEAL_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(screen.getByTestId('chest-reveal')).toBeInTheDocument()
    expect(screen.getByTestId('treasure')).toBeInTheDocument()
  })

  /**
   * The reveal exists to be seen. Resolving the round on the tap would
   * replace it with whatever comes next in the same commit.
   */
  it('holds the round open while the treasure is on screen', async () => {
    const onAnswer = playRound(CHEST_REVEAL_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).not.toHaveBeenCalled()
    advance(CHEST_REVEAL_MS + 50)
    advance(PAST_SENTENCE_MS)
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  /** Nothing in a closing moment is a control. */
  it('takes the choices away so a second tap cannot land', async () => {
    playRound(CHEST_REVEAL_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(screen.queryByTestId('choices')).not.toBeInTheDocument()
  })
})

describe('the sentence', () => {
  it('is not shown on a word the child has only just met', async () => {
    const onAnswer = playRound(SENTENCE_BOX - 1)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(screen.queryByTestId('sentence-moment')).not.toBeInTheDocument()
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('appears after a correct answer once the word is starting to stick', async () => {
    playRound(SENTENCE_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    const moment = screen.getByTestId('sentence-moment')
    expect(moment).toBeInTheDocument()
    expect(moment.textContent).toContain(said.sentences[0].split(/\s+/)[0])
  })

  it('lights the word itself inside the sentence', async () => {
    playRound(SENTENCE_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    const lit = screen.getByTestId('sentence-target')
    expect(lit.textContent?.toLowerCase()).toContain('said')
  })

  /** It is a moment, not a test: there is nothing in it to tap. */
  it('offers nothing to tap', async () => {
    playRound(SENTENCE_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    const moment = screen.getByTestId('sentence-moment')
    expect(moment.querySelectorAll('button')).toHaveLength(0)
  })

  it('reads the sentence aloud', async () => {
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play
    playRound(SENTENCE_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    // Queued behind "Well done!", so the reading starts once that ends.
    advance(PAST_SENTENCE_MS)
    const played = play.mock.instances.map((a) => (a as HTMLAudioElement).src)
    expect(played.some((src) => src.endsWith(sentenceAudioUrl(said.audioId)))).toBe(true)
  })

  it('resolves the round once the sentence has been read', async () => {
    const onAnswer = playRound(SENTENCE_BOX)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).not.toHaveBeenCalled()
    advance(PAST_SENTENCE_MS)
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  /**
   * A closing moment takes time, and an answer's worth was settled the
   * moment it was given.
   */
  it('reports the answer as prompted when the child had asked twice', async () => {
    const onAnswer = playRound(SENTENCE_BOX)
    const speaker = screen.getByRole('button', { name: /hear/i })
    await userEvent.click(speaker)
    await userEvent.click(speaker)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    advance(PAST_SENTENCE_MS)
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })
})
