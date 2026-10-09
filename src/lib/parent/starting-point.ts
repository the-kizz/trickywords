import { BOX_INTERVALS, MAX_BOX } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'
import type { WordSet } from '@/lib/words/types'

/**
 * Turns "this child has already been signed off on these sets at school"
 * into seeded progress.
 *
 * The word sets are the sequence a school sends home, and different
 * children arrive at different points in it. A child whose homework
 * envelope already has Sets 1-6 ticked off is not a beginner on those
 * words -- treating them as one wastes their time and makes the app
 * feel like it doesn't know them. So a signed-off word is seeded at the
 * same `known` state (top box) a word reaches by being answered
 * correctly, unprompted, every time it came up -- this is the existing
 * progress model, not a parallel "already knew it" flag.
 *
 * Pure and side-effect free: the caller is responsible for persisting
 * the result (see the `seed-starting-point` action in
 * `src/app/api/parent/route.ts`).
 */
export function seedProgressForSignedOffSets(
  sets: WordSet[],
  signedOffSetIds: number[],
): Map<string, WordProgress> {
  const signedOff = new Set(signedOffSetIds)
  const seeded = new Map<string, WordProgress>()
  for (const set of sets) {
    if (!signedOff.has(set.id)) continue
    for (const word of set.words) {
      seeded.set(word.id, {
        wordId: word.id,
        stage: 'known',
        box: MAX_BOX,
        dueInSessions: BOX_INTERVALS[MAX_BOX],
        correctStreak: MAX_BOX,
        attempts: MAX_BOX,
        lapses: 0,
        struggling: false,
        saidIt: 0,
        readToAdult: 0,
        // Never credited by a round, so the day floor has nothing to
        // hold back: a parent ticking a set is not a promotion.
        lastCreditedOn: null,
      })
    }
  }
  return seeded
}
