'use client'
import { useEffect, useState } from 'react'
import {
  buildRound, closingWord, planSession, refreshRound, SESSION_LENGTH,
} from '@/lib/engine/session'
import {
  dayKey, newProgress, recordCorrect, recordMiss, recordSaidIt, recordReadToAdult,
  decrementDue,
} from '@/lib/engine/ladder'
import { applyStruggleRules } from '@/lib/engine/strugglers'
import { companionStage, highWaterKnown } from '@/lib/rewards'
import {
  nonFindBudgetFor, ROUND_TYPES, roundTypeFor, type RoundType,
} from '@/components/games'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import { SayIt } from '@/components/games/SayIt'
import { GrownUpProvider } from '@/components/games/GrownUpContext'
import { CompanionPose } from '@/components/companion/CompanionPose'
import { useAudio, warm } from '@/lib/audio/player'
import {
  PHRASES, phraseAudioUrl, sentenceAudioUrl, wordAudioUrl,
} from '@/lib/audio/manifest'
import type { Round } from '@/lib/engine/session'
import type { Word } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  words: Word[]
  /**
   * Whether an adult is sitting with the child for this sitting. It
   * changes one thing: who judges a Read it round, and therefore
   * whether reading a word can promote it. See `ReadIt`.
   */
  grownUp?: boolean
  /**
   * The ids of the island the child tapped. Its words lead the session;
   * words from elsewhere come in as capped review. Without it a tapped
   * island could contribute as little as three of nine rounds while
   * review from other islands filled the rest -- "I did Set 6 and it was
   * mainly Set 7 words".
   */
  islandWordIds?: ReadonlySet<string>
  initialProgress: Map<string, WordProgress>
  onProgressChange: (p: WordProgress) => void
  onComplete: (all: Map<string, WordProgress>) => void
  /**
   * Called when the child dismisses the celebration screen (taps
   * "Continue"). Kept separate from `onComplete` -- `onComplete` only
   * ever persists the final progress, and must never itself cause the
   * caller to unmount this component. If it did, the celebration would
   * be replaced by the map in the very same render as it appears,
   * before a child could ever see it.
   */
  onContinue?: () => void
  /**
   * Start another go on the same island, from live progress and
   * re-shuffled -- the big control on the celebration.
   *
   * A child had to return to the map and tap the same island again to
   * keep going, which is asking a five-year-old to go backwards to go
   * forwards. The caller is expected to remount this component (a
   * changed `key`), because a go is planned once on mount and must be
   * planned again from what the last go has just taught.
   *
   * Optional: a caller with no island to return to simply does not pass
   * it, and the map control is the only one drawn.
   */
  onAgain?: () => void
  /**
   * Leave the session now and go back to the map -- the quiet Back in
   * the corner above the round pips. Optional: a caller that has
   * nowhere to go back to simply does not pass it, and no control is
   * rendered.
   *
   * Non-destructive by construction. Every answer has already been
   * recorded and persisted by the time it could be tapped
   * (`onProgressChange` fires per answer, and `FamilyPlay` writes it
   * straight to `/api/progress`), so leaving abandons only the rounds
   * not yet played. Nothing is rolled back and nothing is asked for
   * confirmation, because there is nothing to confirm.
   *
   * The one thing a child gives up is the end-of-session
   * `decrementDue` pass, which runs on the final answer -- the spaced
   * repetition schedule is deliberately session-based, and a session
   * that was not finished has not happened for scheduling purposes.
   * The ladder boxes, the streaks and the companion already grown all
   * stand.
   */
  onLeave?: () => void
  sessionLength?: number
  /**
   * The most words this child has ever known at once, from their saved
   * profile (or guest record). The celebration's companion is drawn from
   * this rather than from the live count, so a session in which a word
   * slipped back still shows the friend they have grown. Left out -- a
   * caller with nowhere to store it -- the live count stands in, which
   * is the old behaviour.
   */
  bestKnown?: number
  /**
   * Called when the high-water mark rises, so the caller can persist it
   * beside the progress it came from.
   */
  onBestKnownChange?: (best: number) => void
}

const get = (progress: Map<string, WordProgress>, wordId: string) =>
  progress.get(wordId) ?? newProgress(wordId)

const countKnown = (progress: Map<string, WordProgress>) =>
  [...progress.values()].filter((p) => p.stage === 'known').length

/**
 * Drives a session round by round: plans once on mount, renders each
 * round in the type the session picked for it, applies the ladder/struggler rules to each
 * answer, and -- once, at the very end -- decrements every word's due
 * countdown so the spaced-repetition schedule is session-based rather
 * than round-based. Finishes on a celebration screen with no score, no
 * percentage and no correct/incorrect tally: it celebrates finishing,
 * not performance.
 */
export function SessionRunner({
  words, islandWordIds, initialProgress, onProgressChange, onComplete, onContinue, onAgain,
  onLeave, sessionLength = SESSION_LENGTH, bestKnown, onBestKnownChange,
  grownUp = false,
}: Props) {
  const { speak, enqueue } = useAudio()

  // Planned once on mount and held in state -- re-planning on every
  // render would reshuffle the rounds under the child mid-session.
  const [plan] = useState(() => planSession({
    words, islandIds: islandWordIds, progress: initialProgress, length: sessionLength,
  }))

  // The rounds as they will actually be played. A round's support is
  // settled when that round *begins*, from the word's progress at that
  // moment, rather than left as the plan's own snapshot: a word promoted
  // earlier in the same session gets harder straight away, and one that
  // slipped gets easier straight away. Session one on a new set used to
  // be two copy-matches per word, both planned at box 0, which took
  // every word to box 2 without a single retrieval.
  //
  // Never rebuilt mid-round -- see `refreshRound`.
  const [rounds, setRounds] = useState(() => plan.rounds)

  // Fetch and decode every clip this session can ask for, before it asks.
  // A clip played cold takes ~85ms to make a sound on a local server and
  // considerably longer over wifi, which is a large share of a short word
  // -- `is` is 471ms -- and is why single words were the ones a child
  // could not make out. The whole set is 420KB, so there is nothing to be
  // gained by being selective.
  useEffect(() => {
    warm([
      ...Object.keys(PHRASES).map((key) => phraseAudioUrl(key as keyof typeof PHRASES)),
      ...words.map((w) => wordAudioUrl(w.audioId)),
      // The sentence readings too: they are played on the end of a
      // correct round (see `SentenceMoment`), which is the worst place
      // to discover a clip has to be fetched first.
      ...words.map((w) => sentenceAudioUrl(w.audioId)),
    ])
  }, [words])
  const [roundIndex, setRoundIndex] = useState(0)
  const [progress, setProgress] = useState(() => new Map(initialProgress))
  // The words missed at least once this session -- which is also the
  // set that has already lost a box, since the first miss of a session
  // is the one that costs one (see `recordMiss`). A child having a bad
  // minute on one word must not drive it to zero by repetition. Every
  // miss is still recorded in full, so the struggler threshold sees all
  // of them. It is also what keeps a word they have just missed from
  // being the one the session ends on.
  const [missed] = useState(() => new Set<string>())
  // Who said they read the current word, held until the round resolves.
  // Not written straight to progress: the child's path calls `onRead`
  // and then `onAnswer` in the same tick, and two writers each starting
  // from the same rendered `progress` means the second silently drops
  // the first. Folded in by `handleAnswer`, which is the one writer.
  const [readBy] = useState(() => ({ current: null as null | 'child' | 'adult' }))
  // What has gone well this session, for choosing the word to end on.
  // Every session is promised to end on a success, and the promise used
  // to be made when the session was planned -- one measured sitting
  // closed on the word the child had missed in round 8. See
  // `closingWord`.
  const [answeredWell] = useState(() => new Set<string>())
  const [finalProgress, setFinalProgress] = useState<Map<string, WordProgress> | null>(null)
  // The word to read out loud, once the rounds are done. Null until the
  // last round resolves, and null for good if nothing went well enough
  // to ask -- a say-it round is only ever offered on a word the child
  // has just got right.
  const [sayItWord, setSayItWord] = useState<Word | null>(null)
  // Bumped by "let me try again", which remounts the say-it round so it
  // speaks its instruction again. Nothing is recorded by it: trying
  // again is one of two successes, not a second chance at a failure.
  const [sayItAttempt, setSayItAttempt] = useState(0)

  // The words that have already had a round other than Find it this
  // session. One per word per sitting, and one shared budget for the two
  // of them -- see `roundTypeFor`.
  const [nonFindThisSession] = useState(() => new Set<string>())

  // Every word this session has actually begun a round on. The closing
  // round is chosen from these and nothing else, so it can only ever
  // repeat something they have already seen tonight -- never introduce a
  // word out of nowhere to end on.
  const [asked] = useState(() => new Set<string>())

  /**
   * The round type for a round that is about to begin, recording the
   * word as asked and recording any round other than Find it so the same
   * word does not get a second one in the same session.
   */
  function pickRoundType(round: Round): RoundType {
    asked.add(round.word.id)
    // The budget is a share of the session's own length, and the plan is
    // settled before the first round begins, so it never moves.
    const type = roundTypeFor(
      round, nonFindThisSession, nonFindBudgetFor(plan.rounds.length), dayKey(), grownUp,
    )
    if (type !== 'find') nonFindThisSession.add(round.word.id)
    return type
  }

  // The round type is settled when a round *begins*, and held for that
  // round. It cannot be derived at render time from `progress`, because
  // a miss updates progress mid-round: a third miss flips the word's
  // `struggling` flag, and a round type derived from that flag would be
  // swapped out from under the child's finger part-way through the
  // round they are still playing. Choosing once per round means a miss
  // changes nothing on screen, which is the whole contract -- the new
  // support level applies from the word's next round on.
  const [roundType, setRoundType] = useState<RoundType>(() =>
    plan.rounds.length === 0 ? 'find' : pickRoundType(plan.rounds[0]),
  )

  // Snapshotted once on mount, exactly like `plan` above, and for the
  // same reason: the callers own the progress map and hand back a fresh
  // one after every answer (`FamilyPlay` from state, `GuestHome` from
  // the persisted guest record). Recomputing this from the prop would
  // mean the "before" count already included the word the child just
  // learned, so `newlyEarned` below would always be empty and a sticker
  // crossed mid-session would never be announced.
  const [startingKnown] = useState(() => highWaterKnown(bestKnown, countKnown(initialProgress)))
  // The mark reported to the caller so far, so a rise is announced once
  // rather than on every answer that follows it.
  const [reportedBest, setReportedBest] = useState(startingKnown)

  /**
   * Tell the caller the high-water mark has risen, so it can be stored
   * beside the answer that raised it. Only ever upwards -- a word that
   * slipped back never reports a fall, because the mark it would fall
   * to is not a mark at all.
   */
  function noteBest(updated: Map<string, WordProgress>) {
    const known = countKnown(updated)
    if (known <= reportedBest) return
    setReportedBest(known)
    onBestKnownChange?.(known)
  }

  /**
   * Whether every word on the island they tapped has been credited today,
   * which is the honest reading of "the day's due work is done": the day
   * floor in `recordCorrect` cannot credit any of them again until
   * tomorrow, so another go is practice.
   *
   * Read off `lastCreditedOn` rather than counted as the session goes,
   * so a word credited in an earlier go of the same evening counts and a
   * word they missed does not -- a miss clears the stamp, and a word that
   * slipped has due work left on it.
   */
  function islandDoneToday(p: Map<string, WordProgress>): boolean {
    const own = words.filter((w) => islandWordIds === undefined || islandWordIds.has(w.id))
    const today = dayKey()
    return own.length > 0 && own.every((w) => p.get(w.id)?.lastCreditedOn === today)
  }

  useEffect(() => {
    if (!finalProgress) return
    speak(phraseAudioUrl('allDone'))
    // Queued, not spoken: `speak` drops the queue, so a second `speak`
    // here would cut "All done!" off mid-word.
    enqueue([phraseAudioUrl(
      islandDoneToday(finalProgress) ? 'todaysWordsDone' : 'again',
    )])
    // `islandDoneToday` is a pure read of the map this effect is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalProgress, speak, enqueue])

  if (rounds.length === 0 || finalProgress) {
    // The high-water mark, never the live count: a word that slipped
    // back this session must not take a companion stage with it.
    // `startingKnown` is already the mark this session opened on, so
    // this only ever rises.
    const known = finalProgress
      ? Math.max(startingKnown, countKnown(finalProgress))
      : startingKnown

    /*
      Another go, or the map. "Again" is the big one and the map is the
      quiet one, which is the way round a child needs it: the only way to
      keep playing used to be the map and a second tap on the same
      island, and a five-year-old asked to go backwards to go forwards
      mostly stops instead. The go stays short -- the evidence favours
      spacing over massing -- and they repeat it as often as they like.
    */
    const doneToday = finalProgress !== null && islandDoneToday(finalProgress)

    return (
      <div className="flex flex-col items-center gap-6 p-6" data-testid="celebration">
        <CompanionPose pose="cheering" stage={companionStage(known)} />
        <p className="font-display text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-center" role="status">
          {PHRASES.allDone}
        </p>
        {/*
          Said once, and only when it is true. It does not congratulate
          them for stopping and it does not tell them they are finished --
          "Again" is right there underneath, it still works, and the day
          floor is what makes the next go practice rather than a refusal.
        */}
        {doneToday && (
          <p
            data-testid="todays-words-done"
            role="status"
            className="text-[clamp(1.125rem,1.8vw,1.375rem)] font-semibold
              text-muted-foreground text-center max-w-md"
          >
            {PHRASES.todaysWordsDone}
          </p>
        )}
        {onAgain && (
          <button
            type="button"
            data-testid="again-button"
            onClick={() => onAgain()}
            style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
            className="flex items-center justify-center px-8 rounded-clay
              bg-play text-on-play text-[clamp(1.5rem,3vw,2rem)] font-bold cursor-pointer select-none
              focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
          >
            Again
          </button>
        )}
        {/*
          Keeps its old test id: it is still the control that leaves the
          celebration for the map, and the end-to-end suite taps it by
          that name. What changed is its weight and its wording -- it
          used to be the only control here, and "Continue" did not say
          where it went.
        */}
        <button
          type="button"
          data-testid="continue-button"
          onClick={() => onContinue?.()}
          // Quiet, never small: every child target is 76px in both
          // dimensions whatever weight it carries.
          style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
          className={onAgain
            ? `flex items-center justify-center px-4 rounded-clay border-2 border-border
              text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold text-muted-foreground
              cursor-pointer select-none hover:text-foreground
              focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun`
            : `flex items-center justify-center px-6 rounded-clay
              bg-play text-on-play text-[clamp(1.25rem,2.2vw,1.5rem)] font-bold cursor-pointer select-none
              focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun`}
        >
          {onAgain ? 'Back to the map' : 'Continue'}
        </button>
      </div>
    )
  }

  const round = rounds[roundIndex]
  const RoundComponent = ROUND_TYPES[roundType]

  /**
   * A wrong tap, reported by the game. Records the miss and re-applies
   * the struggler rules -- and does nothing else. The round index does
   * not move, the game does not change, the child sees exactly what
   * they saw a moment ago with every control still live. The round still
   * resolves only through `handleAnswer(true, ...)`.
   *
   * This is the channel the engine was missing entirely: with no game
   * ever reporting a miss, `recordMiss` was unreachable from play,
   * `lapses` could only be moved by the parent area or the API, and
   * `STRUGGLE_LAPSE_THRESHOLD` was therefore unreachable by a child --
   * so the support that drops a repeatedly-missed word back to
   * errorless could never fire for the children it exists for.
   */
  function handleMiss() {
    const wordId = round.word.id
    const next = applyStruggleRules(recordMiss(get(progress, wordId), missed.has(wordId)))
    missed.add(wordId)
    const updated = new Map(progress)
    updated.set(wordId, next)
    setProgress(updated)
    onProgressChange(next)
  }

  /**
   * Close the session: the once-per-session `decrementDue` pass, then
   * the celebration. Deliberately not tied to the last answer any more
   * -- the say-it round comes between them, and the schedule must move
   * exactly once however that round goes.
   */
  function finishSession(updated: Map<string, WordProgress>) {
    const decremented = new Map<string, WordProgress>()
    updated.forEach((p, id) => decremented.set(id, decrementDue(p)))
    setProgress(decremented)
    setFinalProgress(decremented)
    onComplete(decremented)
  }

  /**
   * They read the word out loud and says they had it. Recorded on the
   * word -- and only recorded: `recordSaidIt` cannot promote and never
   * demotes, because a five-year-old's self-report is not evidence and
   * there is no wrong answer in a say-it round.
   */
  function handleSaidIt(word: Word) {
    const said = recordSaidIt(get(progress, word.id))
    const updated = new Map(progress)
    updated.set(word.id, said)
    onProgressChange(said)
    setSayItWord(null)
    finishSession(updated)
  }

  /**
   * They read the word aloud and somebody said they got it.
   *
   * Only the count, and which count depends on who said so -- the ladder
   * is moved by `handleAnswer` from the same round, with `prompted`
   * carrying whether it was unaided. Kept apart because the evidence is
   * not the same: their own account of their reading is not evidence, and an
   * adult watching them read from print is the school's own assessment.
   */
  function handleRead(by: 'child' | 'adult') {
    readBy.current = by
  }

  /** Folds a pending read count into the record the ladder just made. */
  function withRead(p: WordProgress): WordProgress {
    const by = readBy.current
    readBy.current = null
    if (by === null) return p
    return by === 'adult' ? recordReadToAdult(p) : recordSaidIt(p)
  }

  function handleAnswer(correct: boolean, prompted: boolean) {
    const wordId = round.word.id
    const current = get(progress, wordId)
    const scored = correct
      // The day the session is being played on. A word is credited at
      // most once per calendar day, because intervals are counted in
      // sessions and a session takes about a minute -- see
      // `recordCorrect`. Read here rather than held from mount, so a
      // sitting that runs over midnight is honest about which day each
      // answer happened on.
      // The island is covered in full every sitting, so a fresh
      // five-word island is five first meetings; the ones past
      // `MAX_NEW_WORDS_CREDITED` play the same round and hold their box
      // -- see `SessionQueue.uncreditedNew`. Invisible to the child, and
      // decided when the session was planned rather than counted as it
      // goes, so a word cannot become uncreditable part-way through.
      ? recordCorrect(
          current, prompted, dayKey(), !plan.uncreditedNew.has(wordId),
        )
      : recordMiss(current, missed.has(wordId))
    if (!correct) missed.add(wordId)
    if (correct) answeredWell.add(wordId)
    const next = withRead(applyStruggleRules(scored))

    const updated = new Map(progress)
    updated.set(wordId, next)
    onProgressChange(next)
    noteBest(updated)

    if (roundIndex >= rounds.length - 1) {
      setProgress(updated)
      // The last thing a session does, before the celebration, is ask
      // them to read one word out loud -- see `SayIt`. On the word they
      // have just got right where possible, which is the word they are
      // most likely to be able to read.
      // Only when nobody is there to hear it. With a grown-up the sitting
      // has already had Read it rounds, judged by the adult and counted;
      // asking again here would ask the same thing twice in a minute and
      // then record the adult's evening as the child reading to herself.
      const toRead = grownUp ? null : (correct && !missed.has(wordId)
        ? round.word
        : words.find((w) => answeredWell.has(w.id) && !missed.has(w.id)) ?? null)
      if (toRead) setSayItWord(toRead)
      else finishSession(updated)
    } else {
      const nextIndex = roundIndex + 1
      setProgress(updated)
      // The closing round's word is chosen here, from what has
      // actually gone well; every other round keeps its planned word
      // and takes its support from progress as it stands now.
      const planned = rounds[nextIndex]
      const refreshed = planned.isFinal
        ? buildRound({
            // Only from the words this session has already asked for:
            // its round is an extra one on the end, so it must not bring
            // in a word of its own (see `planSession`, `closingWord`).
            word: closingWord({
              words: words.filter((w) => asked.has(w.id)),
              progress: updated,
              answeredWell,
              missed,
              justPlayed: wordId,
              fallback: planned.word,
            }),
            words,
            progress: updated,
            isFinal: true,
          })
        : refreshRound(planned, words, updated)
      if (refreshed !== planned) {
        const next = [...rounds]
        next[nextIndex] = refreshed
        setRounds(next)
      }
      setRoundType(pickRoundType(refreshed))
      setRoundIndex(nextIndex)
    }
  }

  const totalRounds = rounds.length

  return (
    <GrownUpProvider value={grownUp}>
    <div
      className="flex flex-col items-center gap-3"
      /*
       * The word this round is asking for, for the end-to-end suite.
       * Invisible, never announced (a `data-` attribute is not in the
       * accessibility tree) and read by nothing at runtime.
       *
       * It is here because the suite has to be able to answer
       * *correctly first time*. Before the miss channel existed, a
       * spec could find the target by tapping choices until one
       * worked, at no cost. Every one of those taps is now a recorded
       * miss, which would bury each word under lapses it never earned
       * and drop them all into the struggling support level.
       */
      data-target-word={(sayItWord ?? round.word).id}
    >
      {/*
        The way out of a running session.

        A five-year-old who taps into the wrong set, or who simply wants
        to stop, had no way out at all on the family side: the only exit
        was finishing all nine rounds, the browser's own Back button, or
        an adult -- and on a home-screen PWA there is no browser Back.

        Three things make this safe where the guest side's "Start again"
        was not. It is **non-destructive**: progress is saved per answer,
        so leaving keeps everything already earned (see `onLeave`). It is
        **quiet**: an outline, muted text, the same shape as the map's
        own Back, so it never competes with the word or the answers for a
        child's attention -- nothing about it invites a tap. And it is
        **far from the answers**: it sits at the very top of the session,
        above the round pips, with the game's instruction, speaker button
        and (at high support) the written prompt word between it and the
        nearest answer -- hundreds of pixels at every viewport, measured
        in `tests/e2e/layout.spec.ts`. "Start again" sat 56px *under* the
        answers, which is the single most likely place in the app for a
        stray finger to land.

        It is absent from the celebration screen, which returns above
        this and has its own Continue.
      */}
      {onLeave && (
        <div className="w-full max-w-2xl flex items-center">
          <button
            type="button"
            data-testid="session-back"
            aria-label="Back to the map"
            onClick={() => {
              speak(phraseAudioUrl('goBack'))
              onLeave()
            }}
            style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
            className="flex items-center gap-1 justify-center px-4
              rounded-clay border-2 border-border text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold
              text-muted-foreground cursor-pointer select-none
              hover:text-foreground
              focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
          >
            <ArrowLeftIcon aria-hidden="true" weight="bold" size={20} />
            Back
          </button>
        </div>
      )}
      {/*
        A bare number means nothing to a pre-reader. The real text lives
        here for screen readers (and for the one existing assertion that
        checks this element's text); what a child sees is a row of small
        pips instead -- one per round, filled in as they are played.
      */}
      <div data-testid="round-counter" className="flex items-center gap-1.5">
        <span className="sr-only">
          {sayItWord ? PHRASES.sayIt : `Round ${roundIndex + 1} of ${totalRounds}`}
        </span>
        <div aria-hidden="true" className="flex items-center gap-1.5">
          {Array.from({ length: totalRounds }, (_, i) => (
            <span
              key={i}
              className={`block w-2.5 h-2.5 rounded-full ${
                i === roundIndex && !sayItWord
                  ? 'bg-fun w-3.5 h-3.5'
                  : i <= roundIndex
                    ? 'bg-primary'
                    : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>
      {/*
        Keyed on the round, so every round starts a game with genuinely
        fresh state. Without it, two consecutive rounds shown by the same
        game component would reuse the previous round's `prompted` /
        listen count (and, in Build the Word, its placed graphemes),
        quietly marking an unaided answer as prompted.
      */}
      {/*
        The rounds, and then the one moment that asks them to read.
        Keyed on the attempt so "let me try again" genuinely starts the
        round over, instruction and all.
      */}
      {sayItWord ? (
        <SayIt
          key={`say-it-${sayItAttempt}`}
          word={sayItWord}
          onSaid={() => handleSaidIt(sayItWord)}
          onAgain={() => setSayItAttempt((n) => n + 1)}
        />
      ) : (
        <RoundComponent
          key={roundIndex}
          round={round}
          onAnswer={handleAnswer}
          onMiss={handleMiss}
          onRead={handleRead}
        />
      )}
    </div>
    </GrownUpProvider>
  )
}
