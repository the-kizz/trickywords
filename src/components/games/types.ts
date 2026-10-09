import type { Round } from '@/lib/engine/session'

export interface GameProps {
  round: Round
  /**
   * Called once the round resolves.
   *
   * `prompted` is true if the child used a hint or missed at least once
   * before answering, which keeps the progress ladder honest about what
   * counts as unaided recall.
   */
  onAnswer: (correct: boolean, prompted: boolean) => void
  /**
   * Called when the child taps a wrong answer -- an error of
   * recognition, not an exploratory pick.
   *
   * This is the engine's only way to learn that a child missed, and it
   * exists because "no fail state" is a rule about what the *child*
   * sees, not about what the engine *records*. Nothing about the round
   * changes when this fires: no "wrong", no red, no score, the round
   * stays open and every button stays live. What changes is invisible --
   * the word's lapse count goes up, and once it passes
   * `STRUGGLE_LAPSE_THRESHOLD` the word drops back to fully errorless
   * support, which is the whole point of having the threshold.
   *
   * One of the seven games deliberately never calls it: in Memory Pairs
   * every card is face down, so the child *cannot* know which one holds
   * the word and a wrong pick is the mechanic working, not a missed
   * word. See the comment in that file. Treasure Hunt used to be the
   * second such game and is not any more -- its chests carry words on
   * their lids, so opening the wrong one is a misread like any other.
   *
   * May fire more than once in a round. The round still resolves only
   * through `onAnswer(true, ...)`.
   */
  onMiss: () => void
  /**
   * Called when the child has read the word aloud and someone has said
   * they got it -- `'child'` when they judged themselves, `'adult'` when a
   * grown-up watching did.
   *
   * Separate from `onAnswer` because the two record different things.
   * `onAnswer` moves the ladder; this moves a count a parent can read,
   * and the counts are kept apart because the evidence is not the same:
   * a five-year-old's own account of their reading is not evidence, and an
   * adult's is the school's own assessment. Only `ReadIt` calls it.
   */
  onRead?: (by: 'child' | 'adult') => void
}
