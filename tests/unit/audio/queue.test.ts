import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  speak, speakSequence, enqueue, silence, clipDurationMs, GAP_MS, UNKNOWN_CLIP_MS,
  STARTUP_GRACE_MS, warm,
} from '@/lib/audio/player'
import { phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import { installClipHarness } from './clip-harness'

/**
 * The app's one voice, as a queue.
 *
 * Every wait here is read from `clipDurationMs` at runtime rather than
 * written down: `CLIP_MS` is generated from the audio files, so any
 * number spelled out in this file would be wrong the next time the voice
 * is regenerated.
 */
const INSTRUCTION = phraseAudioUrl('findTheWord')
const CELEBRATION = phraseAudioUrl('wellDone')
const WORD = wordAudioUrl('said')

let played: string[] = []

beforeEach(() => {
  played = []
  installClipHarness((src) => played.push(src))
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const heard = (url: string) => played.some((src) => src.endsWith(url))
const advance = (ms: number) => vi.advanceTimersByTime(ms)

describe('the audio queue', () => {
  it('starts an enqueued clip at once when nothing is speaking', () => {
    enqueue([INSTRUCTION])
    expect(heard(INSTRUCTION)).toBe(true)
  })

  /**
   * The round-transition fix. A round is answered, the game says "Well
   * done!", and the next round mounts in the same commit -- its
   * instruction used to cancel the celebration 18ms in.
   */
  it('does not start a queued clip before the playing clip has finished', () => {
    speak(CELEBRATION)
    enqueue([INSTRUCTION])
    expect(heard(CELEBRATION)).toBe(true)

    advance(clipDurationMs(CELEBRATION) - 1)
    expect(heard(INSTRUCTION)).toBe(false)

    advance(GAP_MS + 2)
    expect(heard(INSTRUCTION)).toBe(true)
  })

  it('plays a queue in order, each clip waiting on the one before it', () => {
    enqueue([INSTRUCTION, WORD])
    expect(heard(WORD)).toBe(false)
    advance(clipDurationMs(INSTRUCTION) + GAP_MS + 1)
    expect(heard(WORD)).toBe(true)
  })

  it('queues behind clips that are themselves still queued', () => {
    speak(CELEBRATION)
    enqueue([INSTRUCTION])
    enqueue([WORD])

    advance(clipDurationMs(CELEBRATION) + GAP_MS + 1)
    expect(heard(INSTRUCTION)).toBe(true)
    expect(heard(WORD)).toBe(false)

    advance(clipDurationMs(INSTRUCTION) + GAP_MS + 1)
    expect(heard(WORD)).toBe(true)
  })

  /**
   * A child asking to hear the word is the most urgent thing on the
   * channel: they get it now, not behind whatever the app had lined up.
   */
  it('lets a child interrupt: a tap speaks immediately and drops the queue', () => {
    enqueue([INSTRUCTION, WORD])
    played = []

    speak(CELEBRATION)
    expect(heard(CELEBRATION)).toBe(true)

    advance(60_000)
    expect(heard(WORD)).toBe(false)
  })

  it('drops a caller\'s pending clips when that caller cancels', () => {
    speak(CELEBRATION)
    const cancel = enqueue([INSTRUCTION, WORD])
    cancel()

    advance(60_000)
    expect(heard(INSTRUCTION)).toBe(false)
    expect(heard(WORD)).toBe(false)
  })

  /**
   * The round that has just been answered unmounts while the
   * celebration it triggered is still playing. Withdrawing its own
   * pending clips must not cut the celebration short.
   */
  it('leaves the playing clip alone when a queued caller cancels', () => {
    speak(CELEBRATION)
    const cancel = enqueue([INSTRUCTION])
    cancel()
    expect(window.HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
  })

  it('drops the whole queue when the child leaves', () => {
    speakSequence([INSTRUCTION, WORD])
    silence()
    advance(60_000)
    expect(heard(WORD)).toBe(false)
  })

  /**
   * The safety net. A clip that 404s, a blocked autoplay, a decode the
   * browser abandons -- none of them report `ended`, and a queue that
   * waits for an event that never comes would leave the child in silence
   * for the rest of the session.
   */
  it('keeps the queue moving when a clip never reports that it ended', () => {
    // A double that starts clips but never ends them.
    window.HTMLMediaElement.prototype.play = vi.fn(function play(this: HTMLMediaElement) {
      played.push(this.src)
      return Promise.resolve()
    })

    speak(CELEBRATION)
    enqueue([INSTRUCTION])
    expect(heard(INSTRUCTION)).toBe(false)

    advance(clipDurationMs(CELEBRATION) + STARTUP_GRACE_MS + GAP_MS + 1)
    expect(heard(INSTRUCTION)).toBe(true)
  })

  /**
   * Why `warm` and the element cache exist. A clip played cold has to be
   * fetched and decoded before any sound comes out -- 85ms on a local
   * server, more over wifi -- and that delay is a large share of a short
   * word, which is why single words were the ones a child could not make
   * out.
   */
  it('fetches each clip once, however often it is played', () => {
    const before = document.querySelectorAll('audio').length
    warm([WORD])
    speak(WORD)
    silence()
    speak(WORD)
    silence()
    speak(WORD)
    expect(played.filter((src) => src.endsWith(WORD))).toHaveLength(3)
    // Three plays, but no more elements than the one clip needs.
    expect(document.querySelectorAll('audio').length).toBeLessThanOrEqual(before + 1)
  })

  /**
   * Warming used to call `load()` on every clip it was given, including
   * one that was speaking at that moment. `load()` aborts playback, so
   * the clip died mid-word and the browser reported an AbortError the
   * player swallowed: the child just heard nothing. `SessionRunner` warms
   * on mount and again whenever its word list changes identity, which is
   * exactly while a round's opening instruction is playing.
   */
  it('does not stop the clip that is playing when clips are warmed', () => {
    const loads: string[] = []
    window.HTMLMediaElement.prototype.load = vi.fn(function load(this: HTMLMediaElement) {
      loads.push(this.src)
    })

    speak(INSTRUCTION)
    expect(heard(INSTRUCTION)).toBe(true)

    warm([INSTRUCTION, WORD])
    expect(loads.some((src) => src.endsWith(INSTRUCTION))).toBe(false)

    // ...and the queue still runs to completion afterwards.
    enqueue([WORD])
    advance(clipDurationMs(INSTRUCTION) + GAP_MS + 1)
    expect(heard(WORD)).toBe(true)
  })

  it('assumes a generous length for a clip it has no measurement for', () => {
    const parentRecording = '/api/parent/voice/said'
    expect(clipDurationMs(parentRecording)).toBe(UNKNOWN_CLIP_MS)

    speak(parentRecording)
    enqueue([INSTRUCTION])
    advance(UNKNOWN_CLIP_MS - 1)
    expect(heard(INSTRUCTION)).toBe(false)
    advance(GAP_MS + 2)
    expect(heard(INSTRUCTION)).toBe(true)
  })
})
