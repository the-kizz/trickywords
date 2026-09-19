import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhereIsTheHeart, HEART_LAND_MS } from '@/components/games/WhereIsTheHeart'
import { buildRound } from '@/lib/engine/session'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { PHRASES, phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import { installClipHarness } from '../audio/clip-harness'
import { CLIP_MS } from '@/lib/audio/durations'
import { GAP_MS, STARTUP_GRACE_MS } from '@/lib/audio/player'
import type { WordProgress } from '@/lib/engine/types'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'

/**
 * The round that asks *what is tricky* about a word rather than which
 * word it is -- LLLL's own correction step ("remind students of the
 * tricky part of the spelling") as a round, and the only one that
 * teaches why a heart word is a heart word.
 */

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
/** `s ai d` -- one tricky grapheme, the `ai`. */
const said = ALL.find((w) => w.text === 'said')!
/** `o n e` -- two tricky graphemes that are not adjacent; either counts. */
const one = ALL.find((w) => w.text === 'one')!

let played: string[] = []

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => { vi.useRealTimers() })

const roundFor = (word: typeof said, over: Partial<WordProgress> = {}) =>
  buildRound({
    word,
    words: ALL,
    progress: new Map([[word.id, { ...newProgress(word.id), box: 1, ...over }]]),
    isFinal: false,
  })

/**
 * Long enough for everything queued to have been said. Measured from the
 * generated clip table, never named: clip lengths change every time the
 * voice is regenerated.
 */
const PAST_QUEUE_MS = (Math.max(...Object.values(CLIP_MS)) + GAP_MS + STARTUP_GRACE_MS) * 4

/** Lets whatever is queued finish, so `played` is the whole of it. */
const drainAudio = () => act(() => { vi.advanceTimersByTime(PAST_QUEUE_MS) })

/** The grapheme tiles, in the word's own order. */
const parts = () => [...screen.getByTestId('heart-parts').querySelectorAll('button')]

const heartsShown = () =>
  screen.getByTestId('heart-word').querySelectorAll('[data-testid^="tricky-"]').length

function renderRound(word = said, handlers: {
  onAnswer?: (correct: boolean, prompted: boolean) => void
  onMiss?: () => void
} = {}) {
  const onAnswer = handlers.onAnswer ?? vi.fn()
  const onMiss = handlers.onMiss ?? vi.fn()
  render(<WhereIsTheHeart round={roundFor(word)} onAnswer={onAnswer} onMiss={onMiss} />)
  return { onAnswer, onMiss }
}

describe('Where\'s the heart?', () => {
  it('shows the word with its heart hidden, and its parts to tap', () => {
    renderRound()
    expect(screen.getByTestId('heart-word')).toHaveTextContent(said.text)
    expect(heartsShown()).toBe(0)
    expect(parts().map((b) => b.getAttribute('aria-label'))).toEqual(said.graphemes)
  })

  it('asks in words a pre-reader hears as well as sees', () => {
    renderRound()
    expect(document.body.textContent).toContain(PHRASES.whereIsTheHeart)
    expect(played.join(' ')).toContain(phraseAudioUrl('whereIsTheHeart'))
  })

  it.runIf(HEART_MARKS_ENABLED)('lands the heart on the tricky part when they tap it', async () => {
    renderRound()
    await userEvent.click(parts()[said.trickyIndices[0]])
    expect(heartsShown()).toBe(1)
  })

  it('resolves the round unaided, a beat after the heart lands', async () => {
    const { onAnswer } = renderRound()
    await userEvent.click(parts()[said.trickyIndices[0]])
    expect(onAnswer).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(HEART_LAND_MS + 10) })
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('says the word and well done when they have it', async () => {
    renderRound()
    drainAudio()
    played = []
    await userEvent.click(parts()[said.trickyIndices[0]])
    drainAudio()
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
    expect(played.join(' ')).toContain(phraseAudioUrl('wellDone'))
  })

  /** Two tricky graphemes, not adjacent: `one` is o-n-[e] and [o]-n-e. */
  it('accepts either tricky part of a word that has two', async () => {
    expect(one.trickyIndices.length).toBe(2)
    for (const index of one.trickyIndices) {
      const { onAnswer } = renderRound(one)
      await userEvent.click(parts()[index])
      act(() => { vi.advanceTimersByTime(HEART_LAND_MS + 10) })
      expect(onAnswer).toHaveBeenCalledWith(true, false)
      screen.getByTestId('heart-word').remove()
      document.body.innerHTML = ''
    }
  })
})

describe('a wrong tap is an invitation, never a correction', () => {
  it('says the word again and asks them to have another go', async () => {
    renderRound()
    drainAudio()
    played = []
    // The `s` of `said`: a real part of the word, and not the tricky one.
    await userEvent.click(parts()[0])
    drainAudio()
    // The word again, and only then the invitation -- neither cutting
    // the other off.
    expect(played).toEqual([
      expect.stringContaining(wordAudioUrl(said.audioId)),
      expect.stringContaining(phraseAudioUrl('tryAgain')),
    ])
    expect(document.body.textContent).toContain('Have another go')
  })

  it('tells the engine, and shows the child nothing that reads as failure', async () => {
    const { onMiss } = renderRound()
    await userEvent.click(parts()[0])
    expect(onMiss).toHaveBeenCalledTimes(1)
    const text = document.body.textContent!.toLowerCase()
    for (const bad of ['wrong', 'incorrect', 'no,', 'score']) {
      expect(text).not.toContain(bad)
    }
  })

  it('leaves the round open with every part still live', async () => {
    const { onAnswer } = renderRound()
    await userEvent.click(parts()[0])
    expect(onAnswer).not.toHaveBeenCalled()
    expect(heartsShown()).toBe(0)
    expect(parts()).toHaveLength(said.graphemes.length)
    // And they can still find it.
    await userEvent.click(parts()[said.trickyIndices[0]])
    act(() => { vi.advanceTimersByTime(HEART_LAND_MS + 10) })
    // Prompted, because they missed -- the ladder will not promote on it.
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('takes no second answer once the heart has landed', async () => {
    const { onAnswer, onMiss } = renderRound()
    await userEvent.click(parts()[said.trickyIndices[0]])
    await userEvent.click(parts()[0])
    expect(onMiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(HEART_LAND_MS + 10) })
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })
})
