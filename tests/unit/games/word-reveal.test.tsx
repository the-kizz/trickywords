import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROUND_TYPES, type RoundType } from '@/components/games'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import {
  REVEAL_FADE_MS, REVEAL_HOLD_MS, REVEAL_LEAD_IN_MS,
} from '@/components/games/useRoundAudio'
import { clipDurationMs, GAP_MS } from '@/lib/audio/player'
import { phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import { playOutReveal, withRevealTimers } from './reveal'
import { installClipHarness } from '../audio/clip-harness'

/**
 * Item 3 of the gameplay review: show the word, speak it, hide it, then
 * ask.
 *
 * The errorless support used to be the written word left above the
 * choices for the whole round, which made the audio optional in exactly
 * the rounds meant to bond a written form to its sound -- a five-year-old
 * shape-matches, because it is faster than listening and it always
 * works. Measured: a first session on a new set was eight copying rounds
 * and no retrievals at all.
 *
 * Shown alone while it is spoken, then taken away before the choices
 * arrive, the same round becomes a small act of memory and stays
 * errorless: nothing can be got wrong while the word is up, and the
 * speaker is live throughout.
 */

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!
const go = ALL.find((w) => w.text === 'go')!
const little = ALL.find((w) => w.text === 'little')!

/** Box 0: the errorless level, and the one that reveals. */
const boxZero = (): Round => ({
  word: said,
  distractors: [go],
  support: supportFor(newProgress(said.id)),
  box: 0,
  isFinal: false,
})

/** Box 3: support has faded, so there is nothing to reveal. */
const boxThree = (): Round => ({
  ...boxZero(),
  support: supportFor({ ...newProgress(said.id), box: 3 }),
})

/**
 * How long the word is up, worked out the way the component works it
 * out: from the generated clip table. Nothing here may name a clip
 * length -- they all change when the voice is regenerated.
 */
function spokenMs(instruction: string, audioId: string): number {
  return REVEAL_LEAD_IN_MS
    + clipDurationMs(phraseAudioUrl(instruction as never))
    + GAP_MS
    + clipDurationMs(wordAudioUrl(audioId))
    + REVEAL_HOLD_MS
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/** The container each round type puts the things a child taps in. */
const TAPPABLES: Record<RoundType, string> = {
  find: 'choices',
  build: 'tiles',
  heart: 'heart-parts',
  read: 'read-it',
}

let played: string[] = []

beforeEach(() => {
  withRevealTimers()
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => { vi.useRealTimers() })

describe('the word is shown, spoken, hidden, and only then asked for', () => {
  it('opens on the written word with nothing to tap', () => {
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    expect(screen.getByTestId('prompt-word')).toHaveTextContent(said.text)
    expect(screen.queryByTestId('choices')).toBeNull()
  })

  it('takes the word away before the choices arrive', () => {
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    playOutReveal()
    expect(screen.queryByTestId('prompt-word')).toBeNull()
    expect(screen.getByTestId('choices')).toBeInTheDocument()
  })

  /**
   * The timing is the clips' own length, never a guessed constant: clip
   * lengths change every time the voice is regenerated, and a word that
   * left the screen while it was still being said would defeat the whole
   * point of showing it.
   */
  it('keeps the word up until it has finished being spoken', () => {
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    const upFor = spokenMs('findTheWord', said.audioId)
    advance(upFor - 50)
    expect(screen.getByTestId('prompt-word')).toBeInTheDocument()
    expect(screen.queryByTestId('choices')).toBeNull()
    advance(50 + REVEAL_FADE_MS + 10)
    expect(screen.queryByTestId('prompt-word')).toBeNull()
  })

  it('speaks the word while it is on screen', () => {
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    advance(spokenMs('findTheWord', said.audioId) - REVEAL_HOLD_MS)
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
    expect(screen.getByTestId('prompt-word')).toBeInTheDocument()
  })

  it('still lets a child tap the speaker during the reveal', async () => {
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    played = []
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
  })

  it('cuts instead of fading when the system asks for reduced motion', () => {
    const reduce = (matches: boolean) => () => ({
      matches, media: '', addEventListener: () => {}, removeEventListener: () => {},
    })
    window.matchMedia = reduce(true) as unknown as typeof window.matchMedia
    render(<ListenAndFind round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    // No fade at all: the word is gone and the choices are live the
    // instant it has finished being spoken.
    advance(spokenMs('findTheWord', said.audioId) + 1)
    expect(screen.queryByTestId('prompt-word')).toBeNull()
    expect(screen.getByTestId('choices')).toBeInTheDocument()
    window.matchMedia = reduce(false) as unknown as typeof window.matchMedia
  })

  it('has nothing to reveal once support has faded', () => {
    render(<ListenAndFind round={boxThree()} onAnswer={() => {}} onMiss={() => {}} />)
    expect(screen.queryByTestId('prompt-word')).toBeNull()
    expect(screen.getByTestId('choices')).toBeInTheDocument()
  })
})

/**
 * The rule the whole item exists to produce, checked in every game
 * rather than in the one that was measured: the written word and the
 * things a child taps are never on screen at the same time.
 *
 * Where's the heart? passes it without ever revealing, and that is
 * deliberate rather than a loophole: what it asks for is *which part* of
 * the word, so the word itself is the question and not the answer. The
 * engine never gives that round to a word at box 0 or to a struggling
 * one -- the two cases `showWordBeforeRound` covers -- so the errorless
 * reveal has nothing to do there. See `roundTypeFor`.
 */
describe.each(Object.entries(ROUND_TYPES))('round type: %s', (id, Game) => {
  const tappable = TAPPABLES[id as RoundType]

  it('never shows the written word beside the things the child taps', () => {
    render(<Game round={boxZero()} onAnswer={() => {}} onMiss={() => {}} />)
    const wordUp = screen.queryByTestId('prompt-word') !== null
    if (wordUp) expect(screen.queryByTestId(tappable)).toBeNull()
    playOutReveal()
    expect(screen.queryByTestId('prompt-word')).toBeNull()
    expect(screen.getByTestId(tappable)).toBeInTheDocument()
  })
})
