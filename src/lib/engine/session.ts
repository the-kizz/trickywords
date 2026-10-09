import type { Word } from '@/lib/words/types'
import type { WordProgress } from './types'
import { isDue, newProgress } from './ladder'
import { supportFor, type SupportLevel } from './support'
import { pickDistractors } from './distractors'

/** The most rounds a session ever runs. */
export const SESSION_LENGTH = 9

/**
 * The most first meetings a session may **credit** -- not the most it
 * may show.
 *
 * It was a coverage cap and that was a conflation of two different
 * numbers. `MAX_NEW_WORDS = 3` meant a fresh Set 7 asked `all, call,
 * ball` and a child never met `tall` or `little` at all; measured, the
 * island had to be tapped a second time before the whole island
 * appeared, and the father tapped Set 7 repeatedly without ever seeing
 * `little`.
 *
 * Both frameworks separate the two. InitiaLit-F introduces tricky words
 * two at a time and InitiaLit-1 three at a time, and *both then practise
 * the whole set on cards daily* -- "Shuffle Tricky Word Cards and
 * present again"; LLLL's heart-word routine is 5-8 cards a day, swapped
 * in and out. Three is the framework's number for **introduce**. The
 * whole island is the framework's number for **review**.
 *
 * So every word on the tapped island appears in every sitting (see
 * `sessionQueue`), and this caps how many of the first meetings may
 * *count*: the first three unmet words, in set order, may promote to box
 * 1; the rest play exactly the same gentle errorless round, stay at box
 * 0 with the attempt recorded, and are credited normally tomorrow, when
 * they are met words that are due. A first sitting on a fresh five-word
 * island therefore runs about six rounds rather than four.
 *
 * Meeting a word for the first time is still the most expensive round
 * there is, which is why the credit cap stays: crediting five first
 * meetings in one sitting would take five unknown words to box 1 on the
 * evidence of five prompted-and-then-shown rounds.
 */
export const MAX_NEW_WORDS_CREDITED = 3

/**
 * How many of a session's rounds may come from islands other than the one
 * the child tapped.
 *
 * Without a cap, review swamped the choice: every met word that was due
 * came before any new one, and new words are capped, so
 * tapping a fresh Set 6 produced five Set 7 words and three Set 6 ones.
 * Choosing an island is the main say a child has in this app, and an
 * island that mostly teaches a different island makes that say a lie.
 * Review still happens every session -- it just cannot take the session
 * over.
 */
export const MAX_REVIEW_FROM_OTHER_SETS = 3

export interface Round {
  word: Word
  distractors: Word[]
  support: SupportLevel
  /**
   * The box the word stood at when this round began.
   *
   * Support already says how *hard* the round is; this says how far
   * along the word is, which is what the two moments inside a correct
   * round are keyed to -- the chest at box 3 and up, the sentence at
   * box 2 and up (see `ListenAndFind`). It is deliberately not derived
   * from `support`, which is identical at boxes 4 and 5 and identical
   * again for any struggling word whatever box it sits at.
   *
   * Settled when the round begins, from live progress, exactly like
   * `support` -- see `refreshRound`.
   */
  box: number
  isFinal: boolean
}

/**
 * One round, built from a word and the progress it stands at *now*.
 *
 * Support and distractors go together: how hard the choices are and how
 * many there are both come out of the support level, so a round whose
 * support has changed has to be rebuilt rather than patched.
 */
export function buildRound(opts: {
  word: Word
  words: Word[]
  progress: Map<string, WordProgress>
  isFinal: boolean
  rng?: () => number
}): Round {
  const { word, words, progress, isFinal, rng = Math.random } = opts
  const current = get(progress, word)
  const support = supportFor(current)
  const distractors = pickDistractors(word, words, support, rng)
  return {
    word,
    distractors,
    support,
    box: current.box,
    isFinal,
  }
}

const sameSupport = (a: SupportLevel, b: SupportLevel) =>
  a.choices === b.choices
  && a.similarity === b.similarity
  && a.showWordBeforeRound === b.showWordBeforeRound

/**
 * The same round, at the support its word has earned by now.
 *
 * A session's rounds are planned in one go, and a round's support used
 * to be fixed in that plan -- decided from a snapshot taken before the
 * child had answered anything. So a word's *second* appearance in a
 * session was still planned at the box it started at: measured, session
 * one on a new set was two copy-matches per word, both recorded as
 * unaided, taking every word to box 2 without a single retrieval.
 *
 * Called when a round begins, never during one: a miss updates progress
 * mid-round (it can flip `struggling` on the third lapse), and a round
 * rebuilt under the child's finger would move the choices they were
 * reaching for. The new support applies from the word's next round on,
 * which is the same contract the game rotation follows.
 *
 * Returns the round it was given when the support has not moved, so a
 * plan stays exactly as deterministic as it was.
 */
export function refreshRound(
  round: Round,
  words: Word[],
  progress: Map<string, WordProgress>,
  rng: () => number = Math.random,
): Round {
  const current = get(progress, round.word)
  const support = supportFor(current)
  // The box can move while the support level does not -- boxes 4 and 5
  // share a level, and a struggling word sits at the errorless level
  // whatever box it is on. The round still has to know, because the
  // chest and the sentence are keyed to the box; but a box that moved
  // under an unchanged support level must not re-roll the distractors,
  // so it is carried across rather than rebuilt.
  if (sameSupport(support, round.support)) {
    return current.box === round.box ? round : { ...round, box: current.box }
  }
  return buildRound({
    word: round.word, words, progress, isFinal: round.isFinal, rng,
  })
}

/**
 * A copy of `items` in a random order, from the session's own `rng`.
 *
 * Fisher-Yates, and deliberately not `sort(() => rng() - 0.5)`: a
 * comparator that answers inconsistently is not a valid ordering, and
 * the shuffle it produces is measurably biased towards leaving things
 * where they were -- which is the one thing this has to stop doing.
 */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Ordered by `tier`, randomly within each tier.
 *
 * This is the whole of the fix for the identical sitting. Seven
 * consecutive measured sittings were byte-for-byte the same -- `all ball
 * call little tall all`, alphabetical, every time -- because the queue's
 * last tie-break was `a.id.localeCompare(b.id)` and, once a set has been
 * played a few times, every word on it is tied on everything above it:
 * same box, same `dueInSessions`. There was no `rng` in the order of a
 * session at all.
 *
 * The schedule still decides which words a sitting *contains* and which
 * tier each one is in -- a word six sessions overdue still comes before
 * one that came due this session, a due word still comes before a new
 * one, the tapped island still comes before elsewhere. What varies is
 * the order inside a tier, which carried no information: it was
 * alphabetical, and the alphabet is not a teaching order.
 *
 * Shuffle first, then a stable sort on the tier key, so ties keep the
 * shuffled order. `Array.prototype.sort` is required to be stable.
 */
export function withinTiers<T>(
  items: readonly T[], tier: (a: T, b: T) => number, rng: () => number,
): T[] {
  return shuffled(items, rng).sort(tier)
}

/**
 * The fewest queued words a session needs before it ends on a repeat.
 *
 * The closing round asks again for a word the child has already answered
 * well this sitting, so there has to *be* one that is not the word they
 * have this second finished. With a single word queued there is nothing
 * to close on and the session simply ends on it, then the say-it round.
 */
export const MIN_QUEUE_FOR_CLOSING_ROUND = 2

/**
 * The word to end a session on, chosen when the session reaches its
 * last round rather than when it was planned.
 *
 * Every session is promised to end on a success, and the promise used to
 * be made at plan time: the strongest word *then*. One measured session
 * closed on the word the child had missed in round 8, so the sitting
 * ended on a miss-then-prompted-correct. Chosen here, from what has
 * actually gone well, it ends on something they have just got right.
 *
 * In order of preference: the strongest word answered correctly this
 * session and not missed in it; then the strongest word not missed in
 * it; then the strongest word there is. Anything missed this session is
 * passed over while a better option exists, and the word just played is
 * never chosen -- never the same word in the round immediately after
 * itself.
 *
 * `words` is the words this session has **already asked for**, not the
 * whole pool: the caller narrows it (see `SessionRunner`). Its round is
 * appended to the plan rather than replacing the last planned one, so
 * the closing repeat can no longer cost the session a word it promised.
 * It used to overwrite the final round, and on a fresh island that was a
 * third of the content -- "This time: I, the, my" actually asked I, the,
 * I, two new words on the one sitting where meeting new words is the
 * whole point.
 */
export function closingWord(opts: {
  words: Word[]
  progress: Map<string, WordProgress>
  /** Words answered correctly this session. */
  answeredWell: ReadonlySet<string>
  /** Words missed at least once this session. */
  missed: ReadonlySet<string>
  /** The word the round before this one asked for, if any. */
  justPlayed?: string
  /** Used when every candidate is ruled out -- the planned word. */
  fallback: Word
  /**
   * Breaks the tie between equally strong words. Was `a.id.localeCompare(b.id)`,
   * which is why the say-it word -- the word the closing round settles,
   * and the last thing a child does in a sitting -- was `all` in every
   * one of nine measured sittings on Set 7: all five words at the same
   * box, so the alphabet decided.
   */
  rng?: () => number
}): Word {
  const {
    words, progress, answeredWell, missed, justPlayed, fallback,
    rng = Math.random,
  } = opts
  const byStrength = withinTiers(
    words.filter((w) => w.id !== justPlayed),
    (a, b) => get(progress, b).box - get(progress, a).box,
    rng,
  )

  return byStrength.find((w) => answeredWell.has(w.id) && !missed.has(w.id))
    ?? byStrength.find((w) => !missed.has(w.id))
    ?? byStrength[0]
    ?? fallback
}

export interface SessionPlan {
  rounds: Round[]
  /** See `SessionQueue.uncreditedNew` -- carried through to the runner. */
  uncreditedNew: ReadonlySet<string>
}

interface QueueOpts {
  /**
   * Every word this session may draw on: the words the child has
   * already met, plus the current island's. New words can only come
   * from the island, because the island's words are the only ones in
   * here without a progress record.
   */
  words: Word[]
  /**
   * The ids of the island the child tapped. Its words lead the session and
   * everything else is capped review. Omitted, every word counts as the
   * island's, which is the shape the pure-queue tests use.
   */
  islandIds?: ReadonlySet<string>
  progress: Map<string, WordProgress>
  length?: number
  /** See `MAX_NEW_WORDS_CREDITED`. A credit cap, not a coverage cap. */
  maxNew?: number
  maxReviewFromOtherSets?: number
  /**
   * The session's own source of randomness, used only to order words
   * *within* a tier -- see `withinTiers`. Threaded in from
   * `planSession` rather than reached for in here, so a plan is exactly
   * as deterministic as the `rng` it is given and the tests stay
   * repeatable.
   */
  rng?: () => number
}

/**
 * Every word a session on one island may draw on: the words the child
 * has already met anywhere, then the island's own.
 *
 * De-duplicated in that order, so a word that is both met and on this
 * island appears once and keeps its met-word position. This is the
 * whole of what used to be `wordsForSession` and `mixRatioFor` -- there
 * is no ratio and no phasing any more, because `sessionQueue` decides
 * what is actually asked for and it decides it from what is due.
 */
export function sessionPool(islandWords: Word[], metWords: Word[]): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const w of [...metWords, ...islandWords]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    out.push(w)
  }
  return out
}

/**
 * The words a session will ask for.
 *
 * It used to carry a `short` flag too, and the map turned it into
 * "Nothing much is due today, so this will be a short go." That line was
 * false in both directions -- it was computed after the cap on review
 * from other islands, so an island whose own words were all known while
 * ten words were due elsewhere yielded three rounds *and* the note; and
 * it said "today" about a schedule counted in sessions. A short go needs
 * no explanation, and a wrong explanation is worse than none.
 */
export interface SessionQueue {
  words: Word[]
  /**
   * The first meetings this sitting shows but must **not** credit -- the
   * island's unmet words past `MAX_NEW_WORDS_CREDITED`.
   *
   * The child sees no difference: the same reveal-then-find round, the
   * same "Well done!". What differs is invisible, which is the same
   * contract the day floor and prompting already follow -- the word
   * records its attempt and stays at box 0, and tomorrow it is an
   * ordinary met word that is due, and is credited then.
   *
   * Empty except on a sitting that meets more than three words at once,
   * which in practice is the first sitting on a fresh island.
   */
  uncreditedNew: ReadonlySet<string>
}

/**
 * The words a session asks for, in order. One queue, and no mixing.
 *
 * The island the child tapped leads: its due words first, oldest first,
 * then **every** one of its unmet words -- the island is the deck and a
 * deck is dealt whole; `MAX_NEW_WORDS_CREDITED` caps how many of those
 * first meetings may count, not how many are shown. Review from other
 * islands follows, capped at `MAX_REVIEW_FROM_OTHER_SETS`, up to `SESSION_LENGTH`
 * rounds in all. That is all. It replaces two mechanisms
 * doing the same job worse: a 40/60 new-to-review ratio that filled
 * nine rounds from a pool of four to seven words (so every word played
 * about twice a session whatever its due count said, and the expanding
 * intervals in the data model never decided anything), and `mixRatioFor`,
 * which blended in older material by a second, coarser rule. Simulated,
 * the pair of them put 47-55% of a realistic child's rounds on words
 * the app already called known.
 *
 * "Oldest first" is real, not a figure of speech: `dueInSessions` goes
 * *negative* as a word waits (see `decrementDue`), so the most overdue
 * word sorts first. Ties break on the weaker box, and words tied on both
 * are ordered **at random** from the session's `rng` -- see
 * `withinTiers` for why, and for what the alphabetical tie-break that
 * used to sit here cost a child.
 *
 * Every word appears at most once, which also settles two older rules
 * for free: a struggling word cannot dominate a session, and no word is
 * ever asked for in the round immediately after itself.
 *
 * The fallback at the end fires only when nothing is due and nothing is
 * new -- a child coming back for a second go the same day. They get their
 * island's own words, weakest first, and looks wider only if the island
 * they tapped has no words at all. That is practice, and practice is
 * free; it simply cannot promote anything, because the day floor in
 * `recordCorrect` will not credit the same word twice in a day.
 *
 * It used to be *every* met word weakest-first, island ignored -- so
 * tapping a fully-known Set 1 measured as `all ball call little tall a i
 * is my`, five of the nine from Set 7. And because the review countdown
 * was not being written to disk at the time, that fallback was the path
 * most real sittings actually took: the island a child chose decided
 * almost nothing.
 */
export function sessionQueue(opts: QueueOpts): SessionQueue {
  const {
    words, islandIds, progress, length = SESSION_LENGTH, maxNew = MAX_NEW_WORDS_CREDITED,
    maxReviewFromOtherSets = MAX_REVIEW_FROM_OTHER_SETS, rng = Math.random,
  } = opts

  const onIsland = (w: Word) => islandIds === undefined || islandIds.has(w.id)
  // The two tiers a due word can be in, and nothing below them: how
  // overdue it is, then how weak it is. The old third key was the word
  // id, and since a set played a few times has every word tied on both
  // of these, the alphabet was in practice the whole order -- see
  // `withinTiers`.
  const mostOverdueFirst = (a: Word, b: Word) => {
    const pa = get(progress, a)
    const pb = get(progress, b)
    return pa.dueInSessions - pb.dueInSessions || pa.box - pb.box
  }

  const met = words.filter((w) => progress.has(w.id))
  const dueOn = (island: boolean) => withinTiers(
    met.filter((w) => onIsland(w) === island && isDue(get(progress, w))),
    mostOverdueFirst,
    rng,
  )

  const islandDue = dueOn(true)
  // Every unmet word on the island, not the first three: the island the
  // child tapped is the deck, and a deck is dealt whole. Set order here
  // is the framework's introduction order, and it is what decides which
  // of them may be credited -- so the *play* order can be shuffled like
  // any other tier without making credit a matter of luck.
  const islandUnmet = words.filter((w) => !progress.has(w.id) && onIsland(w))
  const uncreditedNew = new Set(islandUnmet.slice(maxNew).map((w) => w.id))
  const islandNew = shuffled(islandUnmet, rng)
  const elsewhereDue = dueOn(false).slice(0, maxReviewFromOtherSets)

  const queue = [...islandDue, ...islandNew, ...elsewhereDue].slice(0, length)

  if (queue.length > 0) {
    return {
      words: queue,
      // Only for words the sitting actually kept: the length cut can
      // drop review from elsewhere, and on a hand-edited island longer
      // than a session it could drop a new word too.
      uncreditedNew: new Set(
        queue.filter((w) => uncreditedNew.has(w.id)).map((w) => w.id),
      ),
    }
  }

  const weakestFirst = (a: Word, b: Word) =>
    get(progress, a).box - get(progress, b).box
  // The island they tapped, and only the island, unless it has nothing on
  // it at all. An island with words but nothing met cannot reach here --
  // its unmet words would have made `islandNew` and a queue.
  const islandMet = met.filter(onIsland)
  const fallback = withinTiers(
    islandMet.length > 0 ? islandMet : met, weakestFirst, rng,
  ).slice(0, length)
  // Nothing due and nothing new, so nothing to credit or withhold.
  return {
    words: fallback.length > 0 ? fallback : words.slice(0, length),
    uncreditedNew: new Set<string>(),
  }
}



interface PlanOpts {
  words: Word[]
  /** See `QueueOpts.islandIds` -- the island the child tapped leads. */
  islandIds?: ReadonlySet<string>
  progress: Map<string, WordProgress>
  length?: number
  rng?: () => number
}

const get = (progress: Map<string, WordProgress>, w: Word) =>
  progress.get(w.id) ?? newProgress(w.id)

/**
 * A session's rounds: one queue (see `sessionQueue`), built into rounds
 * against the progress each word stands at now, and then one more round
 * to end on.
 *
 * That closing round is **appended**, not substituted. It used to be the
 * last planned round with its word swapped out at play time, which meant
 * every session asked for one fewer distinct word than it had queued: a
 * fresh island's first sitting queued I, the and my and asked I, the, I.
 * Two new words, not three, on the session where meeting new words is
 * the entire point -- and the first thing a new child sees.
 *
 * So the content rounds stop one short of `length` when there is a
 * closing round to fit, and every queued word the plan keeps is actually
 * asked for. The word the closing round holds here is a placeholder: it
 * is chosen for real when the session reaches it, from what has gone
 * well, and only from words already asked -- see `closingWord` and
 * `SessionRunner`.
 */
export function planSession(opts: PlanOpts): SessionPlan {
  const {
    words, islandIds, progress, length = SESSION_LENGTH, rng = Math.random,
  } = opts
  if (words.length === 0) return { rounds: [], uncreditedNew: new Set() }

  const { words: queue, uncreditedNew } = sessionQueue({
    words, islandIds, progress, length, rng,
  })
  const closes = queue.length >= MIN_QUEUE_FOR_CLOSING_ROUND
  const content = closes ? queue.slice(0, length - 1) : queue

  const rounds = content.map((word, idx) => buildRound({
    word, words, progress, rng,
    isFinal: !closes && idx === content.length - 1,
  }))
  if (closes) {
    rounds.push(buildRound({
      // A placeholder, always replaced before it is played.
      word: content[0], words, progress, isFinal: true, rng,
    }))
  }
  return {
    rounds,
    // Narrowed to the words the plan actually asks for: the queue can be
    // a word longer than the content when a closing round has to fit,
    // and naming a word uncredited that is never played would be a
    // promise about a round that does not happen.
    uncreditedNew: new Set(
      content.filter((w) => uncreditedNew.has(w.id)).map((w) => w.id),
    ),
  }
}
