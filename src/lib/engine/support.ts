import type { WordProgress } from './types'

export type DistractorSimilarity =
  | 'far' | 'different-initial' | 'shared-letter' | 'near'

export interface SupportLevel {
  choices: number
  similarity: DistractorSimilarity
  /** Whether the heart-marked word itself is shown before the round. */
  showWordBeforeRound: boolean
}

const LEVELS: readonly SupportLevel[] = [
  { choices: 2, similarity: 'far',               showWordBeforeRound: true  },
  { choices: 3, similarity: 'different-initial', showWordBeforeRound: false },
  { choices: 3, similarity: 'different-initial', showWordBeforeRound: false },
  { choices: 4, similarity: 'shared-letter',     showWordBeforeRound: false },
  { choices: 4, similarity: 'near',              showWordBeforeRound: false },
  { choices: 4, similarity: 'near',              showWordBeforeRound: false },
]

/**
 * Support is derived from the word's box, never set independently, so
 * prompting fades automatically as recall strengthens. A struggling word
 * drops straight back to the fully errorless level.
 *
 * That first line is load-bearing in a way it did not used to be. A
 * struggling word used to *also* be forced into a particular game, from
 * a rotation that no longer exists; this is what gives the word its
 * maximum support instead -- two choices, the furthest-apart
 * distractors, and the heart-marked word written out before the round,
 * which both round types honour. Nothing about which round type is
 * showing reaches this function: support is a property of the word,
 * never of the wrapper it is shown in. (The reverse is not true --
 * `roundTypeFor` reads `showWordBeforeRound`, because a word being met
 * for the first time, or one that keeps slipping, is always found rather
 * than built.)
 *
 * Support fades by narrowing and sharpening the choices, and by dropping
 * the written prompt -- never by withholding the spoken word. There used
 * to be a `speakBeforeRound` flag here, false from box 2 up, and a word
 * whose game needed to be *heard* could therefore never be answered
 * unaided from box 2 on: the only way to learn the target was the
 * speaker button, which counted as a hint, so the ladder refused to
 * promote it. Every game now speaks the word at the start of every
 * round (see `useRoundAudio`), so the flag had nothing left to mean.
 */
export function supportFor(p: WordProgress): SupportLevel {
  if (p.struggling) return LEVELS[0]
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, p.box))]
}
