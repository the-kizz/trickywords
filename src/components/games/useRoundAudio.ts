'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAudio, clipDurationMs, GAP_MS } from '@/lib/audio/player'
import { wordAudioUrl, phraseAudioUrl, type PhraseKey } from '@/lib/audio/manifest'
import { useReducedMotion } from '@/lib/useReducedMotion'
import type { Round } from '@/lib/engine/session'

/**
 * How many times a child may ask to hear the word before the answer
 * counts as prompted. The first ask is free: tapping the big speaker to
 * find out what to do is exactly what the UI invites, and a pre-reader
 * has no other way in.
 */
export const FREE_LISTENS = 1

/**
 * How long the word stays up after it has finished being spoken, before
 * it goes. A beat to look at it, and the reason the round is a retrieval
 * rather than a copy: the child has to hold the form for a moment.
 *
 * Every other part of the reveal's length is measured from the clips
 * themselves (`clipDurationMs`) -- clip lengths change whenever the
 * voice is regenerated, so nothing here may assume one.
 */
export const REVEAL_HOLD_MS = 900

/** How long the word takes to fade. Zero under `prefers-reduced-motion`. */
export const REVEAL_FADE_MS = 300

/**
 * Extra slack on the reveal, because the round's own clips are
 * *queued* rather than played at once (see the effect below): the
 * previous round's "Well done!" finishes first, so the word may start
 * being spoken a moment after this round mounts. Without the slack the
 * word could leave the screen while it was still being said, which is
 * the one thing the reveal exists to prevent.
 */
export const REVEAL_LEAD_IN_MS = 800

/** Where a round is in the show-it-then-ask-for-it sequence. */
export type RevealPhase =
  /** The word alone on screen, being spoken. Nothing to tap. */
  | 'showing'
  /** The word fading out. Still nothing to tap. */
  | 'fading'
  /** The word gone; the choices are live. */
  | 'asking'

export interface RoundAudio {
  /**
   * Whether the answer, when it comes, was helped along: a miss, or a
   * second (or later) request to hear the word. Passed straight to
   * `onAnswer`, where the ladder uses it to decide whether the word may
   * be promoted.
   */
  prompted: boolean
  /** The child tapped the speaker. First tap is free -- see FREE_LISTENS. */
  hearWord: () => void
  /**
   * Where the round is in the show-it-then-ask-for-it sequence.
   * `RoundHeader` draws the word from this, and fades it on `fading`.
   * Always `asking` in a round with no reveal.
   */
  revealPhase: RevealPhase
  /**
   * Whether the things the child taps may be on screen. False while the
   * word is being shown and while it is fading, true from then on -- and
   * always true in a round that has no reveal.
   *
   * Every game must honour it. A game that shows its choices while the
   * word is still up turns the round back into a copy, which is the
   * thing being fixed; and if one ever does, `prompted` below refuses
   * the promotion anyway.
   */
  asking: boolean
  /**
   * Record a miss. The round stays open, nothing on screen changes, and
   * the answer is prompted from here on. If the game handed this hook an
   * `onMiss`, it is called too, which is how the engine learns the child
   * missed -- see `GameProps.onMiss`.
   */
  markMissed: () => void
  /** Speak the target word without it counting as a request to hear it. */
  sayWord: () => void
  /**
   * Speak any other phrase (a nudge, a well done). Interrupts. Returns
   * how long it will sound for, from the generated clip table.
   */
  say: (phrase: PhraseKey) => number
  /**
   * A nudge and then the word again, in that order and neither cutting
   * the other off.
   *
   * Interrupts: the child has just acted, so whatever the round was
   * still saying is no longer what she needs to hear. The pair is one
   * call because the second clip has to wait for the first, and the
   * length of the first is only known from the generated clip table --
   * Listen and Find used to chain these on a hard-coded 700ms, which is
   * shorter than "Have another go" at this voice's rate, so the nudge
   * was cut off by the word it was introducing.
   */
  nudgeThenWord: (phrase: PhraseKey) => void
  /**
   * The word, then "Well done!", queued behind whatever is sounding.
   *
   * Queued rather than spoken, because a celebration belongs to the app
   * and not to the child: by the time it is due, the next round has
   * mounted and queued its own instruction and word, and an interrupting
   * celebration used to throw those away. Every round that followed a
   * Build the Word therefore played in silence.
   *
   * Returns how long it will sound for, measured from the generated clip
   * table, so a caller can hold the round open until it has finished --
   * see the comment on the timer in `HeartWordBuilder`.
   */
  celebrate: (audioId: string) => number
}

/**
 * The shared audio and prompting contract every game needs.
 *
 * Two rules, and they are the whole reason this lives in one place:
 *
 *  1. **The target word is always spoken at the start of a round**, in
 *     every game, at every support level. Hearing the word is the only
 *     way to know what to find, so a round that never says it is a round
 *     that cannot be answered -- which is what used to stall words at
 *     box 2 and above in Listen and Find and Build the Word, where the
 *     word was either never spoken or spoken only while support was
 *     high. Support fades by narrowing and sharpening the *choices*
 *     (and by dropping the written prompt), never by withholding the
 *     word itself.
 *
 *  2. **The first listen is free.** `prompted` stays false until either
 *     a miss or a *second* request to hear the word. It remains honest
 *     in every other respect: a miss counts immediately, further
 *     listens count, and the ladder still refuses to promote a genuinely
 *     prompted answer.
 *
 *  3. **A miss is recorded, and never shown.** `markMissed` reports the
 *     miss to the engine through the game's `onMiss` (when it passes
 *     one) at the same time as it flips `prompted`. The two rules are
 *     not in tension: nothing a child can see changes, the round stays
 *     open and every control stays live -- only the word's lapse count
 *     moves, which is what the struggler threshold is measured in.
 *
 *  4. **A supported round shows the word, speaks it, hides it, and
 *     then asks.** Where `support.showWordBeforeRound` is set, the round
 *     opens on the written word alone while it is spoken, the word
 *     fades, and only then do the things the child taps appear
 *     (`showingWord`, `asking`). The errorless support used to be the
 *     word left above the choices for the whole round, which made the
 *     audio optional in exactly the rounds meant to bond a written form
 *     to its sound -- a child this age shape-matches, because it is
 *     faster than listening and it always works. Shown, spoken and then
 *     taken away, the tap becomes a small act of memory; nothing can be
 *     got wrong while the word is up, so it is still errorless, and the
 *     speaker stays live throughout for a child who forgets.
 */
export function useRoundAudio(
  round: Round,
  instruction: PhraseKey,
  onMiss?: () => void,
  targetsShowWords = false,
): RoundAudio {
  const { speak, speakSequence, enqueue } = useAudio()
  const reduced = useReducedMotion()
  const [listens, setListens] = useState(0)
  const [missed, setMissed] = useState(false)

  // A round whose support says to show the written word opens with the
  // reveal; every other round is asking from the start.
  const reveals = targetsShowWords && round.support.showWordBeforeRound
  const [phase, setPhase] = useState<RevealPhase>(reveals ? 'showing' : 'asking')

  const sayWord = useCallback(() => {
    speak(wordAudioUrl(round.word.audioId))
  }, [speak, round])

  const say = useCallback((phrase: PhraseKey) => {
    const url = phraseAudioUrl(phrase)
    speak(url)
    return clipDurationMs(url)
  }, [speak])

  const nudgeThenWord = useCallback((phrase: PhraseKey) => {
    speakSequence([phraseAudioUrl(phrase), wordAudioUrl(round.word.audioId)])
  }, [speakSequence, round])

  const celebrate = useCallback((audioId: string) => {
    const urls = [wordAudioUrl(audioId), phraseAudioUrl('wellDone')]
    enqueue(urls)
    return urls.reduce((ms, url) => ms + clipDurationMs(url), 0)
      + GAP_MS * (urls.length - 1)
  }, [enqueue])

  // The instruction, then the word, the second waiting for the first to
  // finish. Both are needed and the order matters: the instruction says
  // what to do, the word says what to do it to.
  //
  // `enqueue`, not `speakSequence`: a round begins on the same commit
  // that ends the one before it, so an interrupting call here cut
  // "Well done!" off 18ms in and the child heard "Well d--- find the
  // word" nine times a session. Queued, the celebration finishes first.
  // The cancel withdraws this round's own clips and only those, so a
  // round leaving does not silence the celebration that it triggered on
  // its way out -- see `enqueue`.
  useEffect(
    () => enqueue([phraseAudioUrl(instruction), wordAudioUrl(round.word.audioId)]),
    [round, instruction, enqueue],
  )

  // The reveal's clock. The word comes down once the instruction and
  // the word itself have both been said -- measured from the generated
  // clip table, never guessed -- plus a beat to hold it. The fade is
  // skipped entirely under `prefers-reduced-motion`: the word simply
  // cuts.
  useEffect(() => {
    if (!reveals) return
    const spokenMs =
      REVEAL_LEAD_IN_MS
      + clipDurationMs(phraseAudioUrl(instruction))
      + GAP_MS
      + clipDurationMs(wordAudioUrl(round.word.audioId))
      + REVEAL_HOLD_MS
    const fadeMs = reduced ? 0 : REVEAL_FADE_MS
    const toFading = window.setTimeout(() => setPhase('fading'), spokenMs)
    const toAsking = window.setTimeout(() => setPhase('asking'), spokenMs + fadeMs)
    return () => {
      window.clearTimeout(toFading)
      window.clearTimeout(toAsking)
    }
  }, [reveals, reduced, instruction, round])

  const hearWord = useCallback(() => {
    setListens((n) => n + 1)
    sayWord()
  }, [sayWord])

  const markMissed = useCallback(() => {
    setMissed(true)
    onMiss?.()
  }, [onMiss])

  return {
    // The third clause is the rule the review's measurements demanded:
    // a round in which the written word was on screen at the same time
    // as the things the child taps is a copy, not a recall, and copies
    // must not promote -- a first session on a new set used to be eight
    // copy-matches and no retrievals, and every word ended it at box 2.
    // The reveal makes that combination impossible in the games that
    // honour `asking`; this makes it harmless in any that do not.
    prompted: missed || listens > FREE_LISTENS || phase !== 'asking',
    revealPhase: phase,
    asking: phase === 'asking',
    hearWord,
    markMissed,
    sayWord,
    say,
    nudgeThenWord,
    celebrate,
  }
}
