import type { Stage, WordProgress } from './types'

export type { Stage, WordProgress }

/**
 * Expanding intervals, measured in SESSIONS rather than days.
 *
 * A child who plays twice a week still advances; a child who plays daily
 * is not buried in review. Time-based intervals punish irregular play,
 * which is exactly what family life produces.
 */
export const BOX_INTERVALS = [0, 1, 2, 4, 8, 16] as const
export const MAX_BOX = BOX_INTERVALS.length - 1

function stageForBox(box: number, everAttempted: boolean): Stage {
  if (box >= MAX_BOX) return 'known'
  if (box >= 3) return 'reviewing'
  if (everAttempted) return 'learning'
  return 'new'
}

export function newProgress(wordId: string): WordProgress {
  return {
    wordId, stage: 'new', box: 0, dueInSessions: 0,
    correctStreak: 0, attempts: 0, lapses: 0, struggling: false, saidIt: 0,
    readToAdult: 0,
    lastCreditedOn: null,
  }
}

/**
 * Today, as a calendar day: `YYYY-MM-DD` in **local** time.
 *
 * Local and not UTC, because the thing being counted is a family's day.
 * A UTC key rolls over in the middle of the evening in half the world,
 * which would hand a child a second day's promotions at bedtime and
 * none at breakfast.
 */
export function dayKey(when: Date = new Date()): string {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * A calendar day as a whole number of days, so "tomorrow" is "one more".
 *
 * `dayKey` is a string because that is what a progress record stores and
 * compares; this is the same day as something that can be *stepped*,
 * which is what the per-word round rotation needs -- a word moves one
 * place along its cycle each day, and it must do so without anything
 * having to remember what it played yesterday. See `roundTypeFor`.
 *
 * Built through `Date.UTC` from the already-local key rather than from a
 * clock, so it is a pure function of the key and no second timezone
 * conversion can shift it.
 */
export function dayNumber(day: string = dayKey()): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/**
 * A correct answer.
 *
 * Two things can stop it promoting the word, and neither of them is
 * visible to the child -- they were right, they are told they were right, and
 * the round ends the same way either way.
 *
 * **Prompted.** A prompted correct answer is real practice but not
 * evidence of recall, so it counts as an attempt without promoting. That
 * is what makes errorless support safe: heavy prompting cannot inflate
 * progress.
 *
 * **Already credited today.** Intervals are counted in sessions and a
 * session takes about a minute, so five clean sessions -- enough to take
 * a word from never-seen to "Known solidly" -- is five minutes of one
 * afternoon. `today` is the calendar day (see `dayKey`), and a word that
 * has already climbed today holds its box until tomorrow. The round is
 * still recorded in full: the attempt, the streak, and its ordinary
 * place in the schedule. Practice is free; only credit is rationed.
 *
 * `today` is a parameter rather than a clock read in here so the ladder
 * stays a pure function of its inputs. Omitted, no day floor applies at
 * all -- which is what a unit test wants and what no play surface ever
 * does: `SessionRunner` always passes the day, and a test asserts it.
 *
 * **Creditable.** The third thing that can hold a word's box, and the
 * only one the session rather than the answer decides. An island is
 * covered in full every sitting, so a fresh five-word island is met five
 * words at once, and `MAX_NEW_WORDS_CREDITED` allows three of those
 * first meetings to count; the rest pass `creditable: false`. The round
 * is recorded in full and the child is told they were right, exactly as
 * with the day floor -- see `SessionQueue.uncreditedNew`. Defaults to
 * true, so every existing caller and every ordinary answer is unchanged.
 */
export function recordCorrect(
  p: WordProgress, prompted: boolean, today?: string, creditable = true,
): WordProgress {
  const alreadyCreditedToday = today !== undefined && p.lastCreditedOn === today
  const credited = !prompted && !alreadyCreditedToday && creditable
  const box = credited ? Math.min(MAX_BOX, p.box + 1) : p.box
  return {
    ...p,
    box,
    attempts: p.attempts + 1,
    // Unaided is unaided, whether or not the box was allowed to move.
    correctStreak: prompted ? p.correctStreak : p.correctStreak + 1,
    // A prompt means the word was not recalled unaided, so it returns next
    // session rather than waiting out its full box interval. Box 0 is
    // unaffected: min(1, 0) is 0, so a brand-new word still repeats in the
    // same session. A day-floored answer was unaided, so it waits out its
    // interval normally rather than churning back tomorrow.
    dueInSessions: prompted
      ? Math.min(1, BOX_INTERVALS[box])
      : BOX_INTERVALS[box],
    stage: stageForBox(box, true),
    lastCreditedOn: credited ? today ?? p.lastCreditedOn : p.lastCreditedOn,
  }
}

/**
 * A miss costs one box, and only the first miss of a session costs
 * anything at all.
 *
 * This used to set `box: 0`. A word at box 5, answered correctly a dozen
 * times, went back to the very beginning on a single wrong tap -- and
 * the measured consequence was that an ordinary child who is right about
 * 80% of the time never finishes Set 1 at all, because words are knocked
 * down faster than they can climb. A simulated realistic learner needed
 * 104 sessions to finish the twelve sets and a flat-90% child 321; the
 * cause was demotion to zero rather than the intervals. A single lapse
 * is not forgetting.
 *
 * `alreadyDemoted` is how the caller says this word has already lost a
 * box this session: a child having a bad minute on one word taps wrong
 * three times in a row, and three demotions would drive it to zero by
 * the back door. The miss is still recorded in full -- the attempt, the
 * lapse, the broken streak -- so `struggling` and the lapse threshold
 * see every one of them and the errorless support still arrives when it
 * should. Only the fall is capped.
 *
 * `dueInSessions` still resets to 0, so a word that slipped comes back
 * soon rather than waiting out the interval of the box it fell from, and
 * the day floor is cleared -- see below.
 */
export function recordMiss(p: WordProgress, alreadyDemoted = false): WordProgress {
  const box = alreadyDemoted ? p.box : Math.max(0, p.box - 1)
  return {
    ...p, box,
    attempts: p.attempts + 1,
    correctStreak: 0,
    lapses: p.lapses + 1,
    dueInSessions: 0,
    stage: stageForBox(box, true),
    // The day floor is cleared by a miss. It exists to stop a word
    // climbing from new to known inside one sitting; it must not also
    // stop a word winning back a box it already had. A child who slips
    // at four o'clock and has it right again at five has not gained a
    // day's progress -- they have undone a bad minute.
    lastCreditedOn: null,
  }
}

/**
 * The child read the word out loud and said they got it.
 *
 * Recorded and nothing else: it cannot promote, because a self-report is
 * not evidence, and it must never demote, because there is no wrong
 * answer in a say-it round -- the child is the judge and both of their
 * answers are successes. `?? 0` covers a record saved before the field
 * existed.
 */
export function recordSaidIt(p: WordProgress): WordProgress {
  return { ...p, saidIt: (p.saidIt ?? 0) + 1 }
}

/**
 * Notes that an adult watched them read this word and confirmed it.
 *
 * The count only. Whether the word is promoted is the ordinary ladder's
 * business -- the caller passes the same answer through `recordCorrect`,
 * unprompted when the adult said they read it and prompted when the adult
 * had to tell them, which is the same contract as any other round.
 */
export function recordReadToAdult(p: WordProgress): WordProgress {
  return { ...p, readToAdult: (p.readToAdult ?? 0) + 1 }
}

/**
 * How far past due a word is allowed to count.
 *
 * `dueInSessions` goes negative once a word is due, so how long it has
 * been waiting is recorded rather than lost -- that is what "oldest
 * first" in `sessionQueue` sorts on, and there is nothing else on a
 * progress record that could answer it. The floor keeps a word nobody
 * has played for a year from sorting a thousand places ahead of one
 * that has waited a fortnight: past this many sessions overdue, they
 * are all simply overdue.
 */
export const MAX_OVERDUE_SESSIONS = 99

/**
 * One session has passed for this word.
 *
 * Counts down to zero and then keeps going, into the negative, to a
 * floor. Zero means "due"; -6 means "due, and has been for six
 * sessions", which is how the queue knows which of a pile of due words
 * to ask for first. `isDue` is unchanged -- it has always been `<= 0`.
 */
export function decrementDue(p: WordProgress): WordProgress {
  return {
    ...p,
    dueInSessions: Math.max(-MAX_OVERDUE_SESSIONS, p.dueInSessions - 1),
  }
}

export function isDue(p: WordProgress): boolean {
  return p.dueInSessions <= 0
}

/**
 * What a card in a card run is worth.
 *
 * One implementation, because both play surfaces deal the same cards and
 * two copies of this would drift: a fix to the family one would silently
 * leave guest play scoring an island differently.
 *
 * Read unaided, and the ordinary ladder credits it -- day floor and all.
 * Needing to be told is a miss, recorded through the same channel a
 * wrong tap uses, or the cards could only ever push a word up and one
 * failed every evening would still read as known.
 *
 * The new-word cap is deliberately not applied: it exists because a
 * session shows a brand-new word and then asks for it, which is
 * recognition of something just seen. An adult hearing a word read from
 * print is not that, whatever box it is on.
 *
 * `dueInSessions` is carried across untouched. The review schedule
 * belongs to the sessions, and a card run is an assessment taken outside
 * them with no `decrementDue` pass to follow -- resetting the interval
 * here would push these words further out every evening until they
 * stopped coming back as review at all.
 */
export function recordCardRead(
  current: WordProgress, readAlone: boolean, today: string,
): WordProgress {
  const scored = readAlone
    ? recordReadToAdult(recordCorrect(current, false, today, true))
    : recordMiss(current, false)
  return { ...scored, dueInSessions: current.dueInSessions }
}
