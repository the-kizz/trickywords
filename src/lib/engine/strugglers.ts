import type { WordProgress } from './types'

export const STRUGGLE_LAPSE_THRESHOLD = 3
export const STRUGGLE_CLEAR_STREAK = 2

/**
 * Call after every recordCorrect / recordMiss.
 *
 * A word that keeps being missed returns to errorless presentation rather
 * than being drilled harder — frustration is the thing most likely to
 * make a five-year-old stop playing. The flag clears only on unprompted
 * successes, so heavy support cannot quietly clear it.
 *
 * Clearing the flag resets the lapse count, so the threshold measures
 * the *current* struggle rather than the child's whole history. Without
 * that reset, `lapses` stayed at or above the threshold forever: the
 * clear branch would drop the flag and the very next answer would see
 * `!struggling && lapses >= 3` and re-flag it. A word that had slipped
 * three times was then stuck in easy mode for good, and the parent read
 * "this one keeps slipping" about a word the child had since learned.
 */
export function applyStruggleRules(p: WordProgress): WordProgress {
  if (!p.struggling && p.lapses >= STRUGGLE_LAPSE_THRESHOLD) {
    return { ...p, struggling: true }
  }
  if (p.struggling && p.correctStreak >= STRUGGLE_CLEAR_STREAK) {
    return { ...p, struggling: false, lapses: 0 }
  }
  return p
}
