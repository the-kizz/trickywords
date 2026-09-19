import { vi } from 'vitest'
import { act } from '@testing-library/react'
import { CLIP_MS } from '@/lib/audio/durations'
import { GAP_MS } from '@/lib/audio/player'
import {
  REVEAL_FADE_MS, REVEAL_HOLD_MS, REVEAL_LEAD_IN_MS,
} from '@/components/games/useRoundAudio'
import { CHEST_REVEAL_MS } from '@/components/games/ChestReveal'
import { SENTENCE_HOLD_MS, SENTENCE_LEAD_IN_MS } from '@/components/games/SentenceMoment'

/**
 * Long enough for any reveal to have finished: the longest instruction
 * clip, the longest word clip, the beat between them, the hold and the
 * fade.
 *
 * Measured from the generated clip table rather than written down, for
 * the same reason the component measures it -- clip lengths change every
 * time the voice is regenerated, and a test that named a number would
 * start failing for no reason a child would recognise.
 */
export const PAST_REVEAL_MS =
  REVEAL_LEAD_IN_MS
  + Math.max(...Object.values(CLIP_MS)) * 2
  + GAP_MS
  + REVEAL_HOLD_MS
  + REVEAL_FADE_MS
  + 50

/**
 * Plays out the show-the-word-then-hide-it reveal at the top of a
 * highly-supported round, so the round is asking and the things the
 * child taps are on screen.
 *
 * Requires fake timers -- see `withRevealTimers`.
 */
export function playOutReveal(): void {
  act(() => {
    vi.advanceTimersByTime(PAST_REVEAL_MS)
  })
}

/**
 * Fake timers that still advance with real time, so `userEvent` and
 * `waitFor` behave normally while `playOutReveal` can jump the reveal.
 * Call in a `beforeEach`; the matching `vi.useRealTimers()` belongs in
 * an `afterEach`.
 */
export function withRevealTimers(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true })
}

/**
 * Long enough for a correct round's closing moments to have played out:
 * the chest, then the sentence read aloud and held (see `ChestReveal`
 * and `SentenceMoment`). A correct answer on a word past box 2 no longer
 * resolves its round on the tap -- being right takes a beat now -- so a
 * test that answers and then expects the session to have moved has to
 * let that beat happen.
 *
 * Measured from the generated clip table for the same reason
 * `PAST_REVEAL_MS` is.
 */
export const PAST_SENTENCE_MS =
  SENTENCE_LEAD_IN_MS
  + Math.max(...Object.values(CLIP_MS))
  + SENTENCE_HOLD_MS
  + 50

export const PAST_CLOSING_MS = CHEST_REVEAL_MS + 50 + PAST_SENTENCE_MS

/**
 * Plays out both closing moments. Requires fake timers.
 *
 * Two advances, not one: the sentence is mounted by the chest's own
 * timer, so its clock does not start until React has committed that
 * state change -- which happens when the first `act` flushes, not while
 * time is being advanced inside it.
 */
export function playOutClosing(): void {
  act(() => {
    vi.advanceTimersByTime(CHEST_REVEAL_MS + 50)
  })
  act(() => {
    vi.advanceTimersByTime(PAST_SENTENCE_MS)
  })
}
