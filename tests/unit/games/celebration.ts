import { waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { CLIP_MS } from '@/lib/audio/durations'
import { GAP_MS } from '@/lib/audio/player'

/**
 * A correct answer no longer resolves its round on the same tick.
 *
 * The audio was always in the right order -- "Well done!" is queued, so
 * it finishes before the next round's instruction starts -- but the
 * screen was not: the next round mounted while the praise was still
 * sounding, and a child saw the next word before they had finished being
 * told they got this one right. Each game now holds the round open for
 * the length of the celebration, so a test that asserts on `onAnswer`
 * has to wait for it rather than read it off the click.
 *
 * The bound is derived from the clip table rather than named here: clip
 * lengths change whenever the voice is regenerated, and a hard-coded
 * wait would start failing the next time it is.
 */
const LONGEST_CLIP_MS = Math.max(...Object.values(CLIP_MS))

/** The longest a celebration can sound for: two clips and the gap. */
export const CELEBRATION_MS = LONGEST_CLIP_MS * 2 + GAP_MS

/** Resolves once the game has reported the answer it is holding. */
export function answered(onAnswer: Mock): Promise<void> {
  return waitFor(
    () => {
      if (onAnswer.mock.calls.length === 0) throw new Error('round still open')
    },
    { timeout: CELEBRATION_MS + 1000 },
  )
}
