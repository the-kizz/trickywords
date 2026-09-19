import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { speak, clipDurationMs, GAP_MS } from '@/lib/audio/player'
import { phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import { installClipHarness } from '../audio/clip-harness'

/**
 * A round's opening audio, against the clip that is still playing when
 * the round begins.
 *
 * All timings are read from `clipDurationMs` at runtime: `CLIP_MS` is
 * generated from the audio files themselves, so a number written down
 * here would be wrong the next time the voice is regenerated.
 */
const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!

const round: Round = {
  word: said,
  distractors: [
    ALL.find((w) => w.text === 'go')!,
    ALL.find((w) => w.text === 'the')!,
    ALL.find((w) => w.text === 'my')!,
  ],
  support: supportFor({ ...newProgress('said'), box: 3, stage: 'reviewing' }),
  box: 0,
  isFinal: false,
}

const INSTRUCTION = phraseAudioUrl('findTheWord')
const CELEBRATION = phraseAudioUrl('wellDone')
const WORD = wordAudioUrl(said.audioId)

let played: string[] = []

beforeEach(() => {
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => {
  vi.useRealTimers()
})

const heard = (url: string) => played.some((src) => src.endsWith(url))
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('a round beginning while something is still being said', () => {
  /**
   * The measured bug: "Well done!" and the next round's instruction
   * started 18ms apart, so the child heard "Well d--- find the word"
   * nine times a session. The round queues now.
   */
  it('lets the celebration finish before the new instruction starts', () => {
    vi.useFakeTimers()
    speak(CELEBRATION)
    render(<ListenAndFind round={round} onAnswer={() => {}} onMiss={() => {}} />)

    expect(heard(CELEBRATION)).toBe(true)
    advance(clipDurationMs(CELEBRATION) - 1)
    expect(heard(INSTRUCTION)).toBe(false)

    advance(GAP_MS + 2)
    expect(heard(INSTRUCTION)).toBe(true)
  })

  it('still says the word, after the celebration and the instruction', () => {
    vi.useFakeTimers()
    speak(CELEBRATION)
    render(<ListenAndFind round={round} onAnswer={() => {}} onMiss={() => {}} />)

    advance(clipDurationMs(CELEBRATION) + clipDurationMs(INSTRUCTION) + GAP_MS * 2 + 2)
    expect(heard(WORD)).toBe(true)
  })

  /**
   * The queue is for the app's own voice. A child tapping the speaker is
   * asking for the word *now*, and must not be made to wait behind an
   * instruction they have already heard.
   */
  it('lets a speaker tap interrupt the queue', () => {
    speak(CELEBRATION)
    render(<ListenAndFind round={round} onAnswer={() => {}} onMiss={() => {}} />)
    played = []

    screen.getByRole('button', { name: /hear/i }).click()
    expect(heard(WORD)).toBe(true)
  })

  /**
   * A child who leaves mid-round takes the silence with them: nothing
   * from an abandoned round may speak over the map.
   */
  it('drops the pending word when the round unmounts', () => {
    vi.useFakeTimers()
    const { unmount } = render(
      <ListenAndFind round={round} onAnswer={() => {}} onMiss={() => {}} />,
    )
    expect(heard(INSTRUCTION)).toBe(true)
    unmount()

    advance(60_000)
    expect(heard(WORD)).toBe(false)
  })
})
