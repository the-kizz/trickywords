export const COMPANION_THRESHOLDS = [0, 5, 15, 30, 45] as const
export type CompanionStage = 0 | 1 | 2 | 3 | 4

/**
 * The most words this child has ever known at once.
 *
 * The companion is drawn from this, never from the live count. It used
 * to be a pure function of how many words are *currently* known, so a
 * single wrong tap that demoted a word out of `known` shrank the
 * companion -- a child losing something they had earned because they
 * mis-tapped once. The comment on `companionStage` has always said the
 * companion only ever grows; this is what makes that true.
 *
 * `best` is `undefined` for a profile saved before this field existed.
 * Seeding it from the live count is the migration: an existing child
 * opens the app and sees exactly what they saw last time, and the mark
 * rises from there.
 *
 * Progress figures a parent sees are untouched by this -- they go on
 * reporting the truth about what is known today. This is only about what
 * the child is shown they have earned.
 */
export function highWaterKnown(best: number | undefined, knownNow: number): number {
  return Math.max(best ?? knownNow, knownNow)
}

/** The companion only ever grows. Nothing a child does makes it shrink. */
export function companionStage(knownCount: number): CompanionStage {
  let stage = 0
  COMPANION_THRESHOLDS.forEach((t, i) => { if (knownCount >= t) stage = i })
  return stage as CompanionStage
}
