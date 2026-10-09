import type { Word, WordSet } from '@/lib/words/types'
import type { WordProgress } from './types'

export const UNLOCK_THRESHOLD = 0.8

/**
 * A set opens the next one at 80% known. Requiring every word would
 * strand a child on one stubborn word and stall the whole map.
 */
export function isSetComplete(
  words: Word[],
  progress: Map<string, WordProgress>,
): boolean {
  if (words.length === 0) return false
  const known = words.filter((w) => progress.get(w.id)?.stage === 'known').length
  return known / words.length >= UNLOCK_THRESHOLD
}

/**
 * Every word in the set known.
 *
 * Distinct from `isSetComplete` on purpose, and the distinction matters
 * because the two answer different questions. "May they move on?" is
 * generous at 80%, so one stubborn word cannot strand them. "Is this
 * finished?" cannot be: an island that draws a finished tick while
 * reading 4/5 contradicts itself on one card, and a "You know them all"
 * screen at 80% of every set tells a child something untrue about
 * eleven words they have not learned yet.
 */
export function isSetFullyKnown(
  words: Word[],
  progress: Map<string, WordProgress>,
): boolean {
  if (words.length === 0) return false
  return words.every((w) => progress.get(w.id)?.stage === 'known')
}

/**
 * The island the child is on.
 *
 * In order: the island they most recently played, which the play surfaces
 * **persist** (a `lastSet:<profileId>` setting in family mode, a field on
 * the guest record in guest mode) and hand back in `lastPlayed`; then the
 * furthest island they have actually touched and not yet done enough of;
 * then the first island they have not done enough of; then the last one
 * there is.
 *
 * The middle step is what a record saved before the island was persisted
 * falls back to, and it is there because the step after it is wrong for
 * exactly the child this app was built for. `lastPlayed` used to come
 * from React state alone, so after any reload it was `undefined` and the
 * answer was "the first island under 80%" -- Set 1, for a child whose
 * homework is Set 7. The furthest island they have put a word into is a
 * far better guess at where they were than the first one they have not
 * finished, because free choice means the islands behind them may never
 * have been touched at all.
 *
 * One definition, used by the map (which marks it as current and sits
 * the companion on it) and by the session it starts. Two definitions of
 * "here" would sooner or later disagree, and a five-year-old would be
 * told them companion was on one island while the words came from
 * another.
 */
export function currentSet(
  sets: WordSet[],
  progress: Map<string, WordProgress>,
  lastPlayed?: number | null,
): WordSet | null {
  if (sets.length === 0) return null
  const started = (s: WordSet) => s.words.some((w) => progress.has(w.id))
  const unfinished = (s: WordSet) => !isSetComplete(s.words, progress)
  // Where they left off, unless they left off having finished it: an island
  // they have completed is somewhere to return to by choice, not somewhere
  // to be put back on every time they open the app. Finishing one should
  // move the companion along.
  return sets.find((s) => s.id === lastPlayed && unfinished(s))
    ?? [...sets].reverse().find((s) => started(s) && unfinished(s))
    ?? sets.find(unfinished)
    ?? sets[sets.length - 1]
}
