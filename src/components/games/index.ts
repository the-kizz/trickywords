import type { ComponentType } from 'react'
import { dayKey, dayNumber } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import type { GameProps } from './types'
import { ListenAndFind } from './ListenAndFind'
import { HeartWordBuilder } from './HeartWordBuilder'
import { WhereIsTheHeart } from './WhereIsTheHeart'
import { ReadIt } from './ReadIt'
import { READ_ROUND_ENABLED } from '@/lib/teaching'
import { HEART_ROUND_ENABLED } from '@/lib/teaching'

/**
 * The shapes a round can take.
 *
 * There were seven, and five of them were the same act -- hear the word,
 * tap its written form -- wearing a different noun. Measured, a child
 * could not tell Bingo, Word Swat, Treasure Hunt and Spot the Word apart
 * from Find it, because there was nothing to tell apart; and Memory
 * Pairs could be won, and a word marked "known", without reading
 * anything at all. What each of the cut games was actually right about
 * is kept: Treasure Hunt's reveal and Spot the Word's sentence are now
 * moments inside a correct Find it round (see `ChestReveal`,
 * `SentenceMoment`).
 *
 * None of these is chosen by the child. There is no chooser any more:
 * what a five-year-old was actually choosing was seven pictures of one
 * activity. The agency that matters -- which island, and when to stop --
 * both stay.
 */
/**
 * Fewest graphemes worth looking inside. Below it there is nothing to
 * order and nothing to point at: of the 56 words, "I" and "a" are
 * single-grapheme heart words, and one tile is one tap whichever round
 * it is.
 */
export const MIN_GRAPHEMES_TO_BUILD = 2

/**
 * The box a word has to reach before it is built rather than looked
 * into.
 *
 * Reading a word comes before spelling it -- in the demands themselves,
 * and in InitiaLit's own sequence, where tricky words are read in
 * Foundation and taught for spelling in Year 1. Build the Word is also
 * the longest round in the app and asks for the whole form from memory,
 * where Read it is one word on screen. So a word's first round other
 * than Find, at box 1, is Read it; building starts at box 2.
 */
export const MIN_BOX_TO_BUILD = 2

/**
 * Re-exported so a round's own module reads as the authority on which
 * rounds run; the reasoning, and the matching flag for the mark itself,
 * live together in `teaching.ts`.
 */
export { HEART_ROUND_ENABLED }

/**
 * The share of a session's rounds that may be anything other than Find
 * it.
 *
 * It began as a cap on Build the Word alone, for a measured reason:
 * building was about half of all rounds from the second day onwards --
 * every heart word past box 0 builds, 37 of the 56 default words are
 * heart words, and one live session ran 7 builds out of 9. Read it now
 * draws on the same sittings, and on *more* words than Build does, so
 * capping them separately would hand back the ground the first cap won.
 * One budget between them.
 *
 * Half a go, so the core recognition drill stays the spine of a sitting:
 * Find it is what the school's own test is closest to, it is the round
 * for every first meeting and every struggling word, and half is the
 * most that can be given away before a sitting stops being a sight-word
 * drill. It is a share rather than a count because a session is as long
 * as there is work due, and one such round in a three-round sitting is
 * the same experience as four in nine.
 */
export const MAX_NON_FIND_SHARE = 1 / 2

/**
 * How many non-Find rounds a session of `totalRounds` may run.
 *
 * Always at least one: the point of these rounds is that a child meets
 * them now and then, and a short sitting that could never run one would
 * mean a child who only ever plays short sittings never sees them at all.
 */
export function nonFindBudgetFor(totalRounds: number): number {
  return Math.max(1, Math.floor(totalRounds * MAX_NON_FIND_SHARE))
}

export type RoundType =
  /** Hear the word, find it among a few others. The app's core act. */
  | 'find'
  /**
   * Build the word from its graphemes in order, with the heart landing
   * on the part that has to be remembered. The only round that makes a
   * child look *inside* a word.
   */
  | 'build'
  /**
   * Tap the part of the word that does not say its sound; the heart
   * lands on it. The only round that asks *why* a word is tricky rather
   * than only which word it is.
   */
  | 'heart'
  /**
   * The word alone, no sound, and they read it out loud.
   *
   * The only round that runs the other way -- form to sound rather than
   * sound to form -- and the only one that matches what the school
   * actually tests. InitiaLit-Foundation's progress monitoring is a list
   * of tricky words read aloud from print, unaided; every other round
   * here asks them to pick a word out of a few, which is an easier act
   * and a different one.
   *
   * Who judges depends on who is there. On their own they say whether they
   * read it, which is recorded and never promotes. With a grown-up
   * watching, the grown-up says, and that does promote -- see
   * `ReadIt`.
   */
  | 'read'

export const ROUND_TYPES: Record<RoundType, ComponentType<GameProps>> = {
  find: ListenAndFind,
  build: HeartWordBuilder,
  heart: WhereIsTheHeart,
  read: ReadIt,
}

/**
 * The round types this word may meet, in the order it rotates through
 * them -- one place a day, see `roundTypeFor`.
 *
 * Find it is in every cycle, and first. It is the core recognition act,
 * and a word that was a Find yesterday being a Read today is the
 * rotation working, not a gap in it.
 *
 * After that the two rounds have different reach, and deliberately:
 *
 *  - **Read it** takes every word past box 0. It asks them to read what
 *    is on screen, which any word can be asked of -- at school every one
 *    of the 56 is a card held up with "What word?".
 *  - **Build the Word** takes only a heart word with a marked tricky
 *    part and more than one grapheme, from box 2. It asks for the whole
 *    spelling from memory, so it needs something to build; `I` and `a`
 *    are one tile and one tap.
 *
 * Reading comes before spelling, which is both the sensible order of
 * demands and InitiaLit's own: tricky words are read in Foundation and
 * only spelt in Year 1.
 */
export function roundCycleFor(round: Round, grownUp = false): RoundType[] {
  // A word being met for the first time, or one that keeps slipping,
  // gets the gentlest round there is, every day, whatever the rotation
  // would otherwise say -- Benton's rule: a familiar mechanic when the
  // content is new. Both show as `showWordBeforeRound`.
  if (round.box < 1 || round.support.showWordBeforeRound) return ['find']

  const cycle: RoundType[] = ['find']

  // Read it takes every word, and that is the difference between it and
  // the other two. They are about the heart, so they need a heart word
  // with something marked and more than one grapheme to work on. Reading
  // a word aloud needs none of that: at school every one of the 56 is a
  // card held up with "What word?", including `I`, `a`, and the ones
  // this app happens to classify as decodable.
  //
  // But only when somebody is there to hear it. Nothing in this app
  // listens, so alone the round can do no more than ask the child to
  // judge themselves -- and a self-report resolves as prompted, which
  // takes no credit and resets the review interval to 1. A word gets one
  // round a sitting and the rotation is keyed to the day, so a word whose
  // turn it was to be read simply could not be credited that day.
  // Simulated over a fresh island that cost a solo child 60-75% more days
  // to know it -- 17.6 days against 10.2 on Set 8 -- for no evidence
  // gained, and worst exactly where Build cannot help either: Sets 8 and
  // 11 have no buildable words at all, so every word there would
  // alternate Find and an unscorable Read.
  //
  // Alone, the reading moment is the one at the end of a sitting
  // (`SayIt`), which asks the same thing and claims nothing by it.
  if (READ_ROUND_ENABLED && grownUp) cycle.push('read')

  // Build the Word asks for the whole spelling from memory, so it needs
  // a word there is something to build: more than one grapheme, and a
  // marked tricky part for the heart to land on.
  const buildable = round.word.classification === 'heart'
    && round.word.trickyIndices.length > 0
    && round.word.graphemes.length >= MIN_GRAPHEMES_TO_BUILD
  if (buildable && round.box >= MIN_BOX_TO_BUILD) cycle.push('build')

  if (HEART_ROUND_ENABLED && buildable) {
    // Naming the tricky part before reproducing the whole spelling, in
    // that framework's own sequence -- so it sits ahead of Build.
    cycle.splice(cycle.indexOf('build') === -1 ? cycle.length : cycle.indexOf('build'), 0, 'heart')
  }
  return cycle
}

/**
 * A word's own offset into its cycle, so the whole deck does not rotate
 * in lockstep.
 *
 * Without it every eligible word on an island would want the same type
 * on the same day, the budget would take the first half of them and a
 * sitting would read as "today is building day" -- which is a theme, not
 * a rotation. Offset per word, a go is a mix on every day of the cycle.
 */
function wordOffset(wordId: string): number {
  let h = 0
  for (let i = 0; i < wordId.length; i++) {
    h = (h * 31 + wordId.charCodeAt(i)) % 9973
  }
  return h
}

/**
 * Which round type a word gets, decided by the session rather than by a
 * chooser.
 *
 * Tomorrow differs from today by design. The word steps one place along
 * its own cycle (see `roundCycleFor`) for each calendar day, offset by
 * the word itself, so a word that was a Find yesterday is a Build or a
 * Where's-the-heart today where it qualifies -- and a session can be
 * planned from the word and the date alone, with no history of round
 * types stored anywhere. Nine measured sittings ran Build the Word on
 * `little`, in the same slot, every single time.
 *
 * Two things still override the rotation, and both of them should:
 *
 *  - a word that has **already had a round other than Find it this
 *    session** gets a Find. Once is a different way of looking at a
 *    word; twice is a chore.
 *  - a session that has **spent its non-Find budget** -- half its
 *    rounds, see `nonFindBudgetFor` -- gets Finds for the rest. The
 *    recognition drill is the spine of a sitting and stays it.
 *
 * Pure, and takes the day and the set of words already varied rather
 * than reading a clock or any state of its own, so a session can decide
 * this the moment a round begins -- the same contract support follows.
 * `budget` defaults to no cap, which is what the per-word unit tests
 * want; every play surface passes one.
 */
export function roundTypeFor(
  round: Round,
  nonFindThisSession: ReadonlySet<string>,
  budget = Infinity,
  day: string = dayKey(),
  grownUp = false,
): RoundType {
  const cycle = roundCycleFor(round, grownUp)
  const wanted = cycle[(dayNumber(day) + wordOffset(round.word.id)) % cycle.length]
  if (wanted === 'find') return 'find'
  if (nonFindThisSession.size >= budget) return 'find'
  if (nonFindThisSession.has(round.word.id)) return 'find'
  return wanted
}

export type { GameProps }
