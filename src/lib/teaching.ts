/**
 * Which teaching method this build follows.
 *
 * This app's word lists are InitiaLit-Foundation's, set for set and word
 * for word -- the twelve tricky-word groups in MultiLit's own scope and
 * sequence. Its *method*, for a while, was not. The heart -- marking the
 * part of a word that cannot be sounded out, and asking a child to find
 * it -- belongs to Really Great Reading's Heart Word Magic and to Little
 * Learners Love Literacy, which borrows it. InitiaLit-F does not teach
 * it. Its tricky-word routine is whole-word: hold up the card, "What
 * word?", signal, then use it in a sentence. The words "heart", "tricky
 * part" and "irregular" appear nowhere in the official sample pack.
 *
 * A child on InitiaLit-F has therefore never been taught to find the
 * tricky part, and a round they cannot be expected to answer is not a
 * hard round, it is a wrong one.
 *
 * Both flags are off, and they belong together: the mark and the round
 * that teaches it are one method, and a mark with no lesson behind it is
 * worse than neither -- a symbol a child has never had explained, that
 * their teacher never draws, sitting on some words and not others. Turn
 * both back on for a school that teaches it, or for Year 1.
 */

/** Whether the round that asks a child to find the tricky part runs. */
export const HEART_ROUND_ENABLED = false

/**
 * Whether the heart is drawn over the tricky part at all -- in the word
 * reveal, in Build the Word, and in Read it.
 */
export const HEART_MARKS_ENABLED = false

/**
 * Whether Read it runs -- the round that shows a word with no sound and
 * asks the child to read it.
 *
 * On, and it is the one round that matches what their school actually
 * measures. InitiaLit-Foundation's progress monitoring is a list of
 * tricky words read aloud from print, unaided ("4. Reading tricky words
 * -- he, she, we, are, said... /13"), and its lesson routine is the same
 * act: hold up the card, "What word?", signal. Everything else in this
 * app asks them to pick a word out of a few, which is a different and an
 * easier thing -- the app's "known" meant "picked it out of four, on
 * five days".
 *
 * A flag at all only so it can be turned off the way the others can,
 * without unpicking the rotation. There is no reason to.
 */
export const READ_ROUND_ENABLED = true
