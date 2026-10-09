import { MAX_BOX } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

/**
 * Turns raw progress fields into a sentence a tired parent can actually
 * read at 8pm -- "lapses: 3" means nothing without context, but "this
 * one keeps slipping" tells them what to help with tonight.
 */
export function summarizeWordProgress(p: WordProgress): string {
  if (p.struggling) {
    return "This one keeps slipping, so it's back on easy mode."
  }
  if (p.stage === 'known') {
    return "Known solidly -- comes up now and then just to keep it fresh."
  }
  if (p.stage === 'reviewing') {
    return "Getting there -- coming back for a bit more practice."
  }
  if (p.stage === 'learning') {
    return p.lapses > 0
      ? "Still settling in, with a wobble or two along the way."
      : "Just met -- still settling in."
  }
  return "Not started yet."
}

/**
 * Where a word has got to, as a step count a parent can read.
 *
 * It used to be `Step ${box + 1} of ${MAX_BOX + 1}`, which contradicted
 * itself on the very first row a parent saw: a word never met read "Step
 * 1 of 6 -- Not met yet." Box 0 is not a step they have taken.
 *
 * So this counts **credits earned**, not boxes occupied: five clean,
 * unaided answers on five different days is what takes a word from met
 * to known, and those five are the steps. Nothing met is "Not started";
 * met but not yet credited is "Just met" (true, where "Not started"
 * would be a lie about a word they have played); after that, Step 1 to 4
 * of 5, and then "Known".
 *
 * `attempts` rather than the stage decides whether they have met it,
 * because a word can be at box 0 and stage `learning` after a wobble --
 * that word has been played, and saying otherwise would contradict the
 * sentence beside it.
 */
export function wordStepLabel(p?: WordProgress): string {
  if (!p || p.attempts === 0) return 'Not started'
  if (p.box >= MAX_BOX) return 'Known'
  if (p.box <= 0) return 'Just met'
  return `Step ${p.box} of ${MAX_BOX}`
}

/**
 * How this word's reading has actually been heard -- the sentence that
 * `WordProgress.saidIt` promised a parent and never showed them.
 *
 * Two counts, kept apart because the evidence is not the same. An adult
 * watching them read a word from print with no sound to copy is the
 * school's own assessment, and it moves the ladder. Their own "I read it"
 * does not, and saying so plainly is the point: a parent reading
 * "Known solidly" deserves to know that means they pick it out of a few,
 * and whether anyone has ever heard them read it.
 *
 * Empty string when neither has happened, so a caller can leave the line
 * out rather than print a row of zeroes.
 */
export function readingSummary(p?: WordProgress): string {
  const toAdult = p?.readToAdult ?? 0
  const alone = p?.saidIt ?? 0
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`)
  if (toAdult > 0 && alone > 0) {
    return `Read aloud to you ${times(toAdult)}, and to themselves ${times(alone)}.`
  }
  if (toAdult > 0) return `Read aloud to you ${times(toAdult)}.`
  if (alone > 0) return `Read aloud to themselves ${times(alone)} -- you have not heard this one yet.`
  return ''
}
