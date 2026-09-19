'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { ADULT_TARGET_PX, MIN_TARGET_PX } from '@/lib/constants'
import { Avatar } from '@/components/avatar/Avatar'
import { ProgressMap } from '@/components/map/ProgressMap'
import { SessionRunner } from '@/components/SessionRunner'
import { sessionPool } from '@/lib/engine/session'
import {
  dayKey, newProgress, recordCorrect, recordMiss, recordReadToAdult,
} from '@/lib/engine/ladder'
import { applyStruggleRules } from '@/lib/engine/strugglers'
import { currentSet, isSetFullyKnown } from '@/lib/engine/unlock'
import { KnowThemAll } from '@/components/map/KnowThemAll'
import { IslandWords } from '@/components/map/IslandWords'
import { GrownUpToggle } from '@/components/map/GrownUpToggle'
import { CardRun } from '@/components/family/CardRun'
import { companionStage, highWaterKnown } from '@/lib/rewards'
import { setVoiceOverrides } from '@/lib/audio/manifest'
import type { WordSet, Word } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  profileId: number
  profileName: string
  profileAvatar: string
  sets: WordSet[]
  initialProgress: Record<string, WordProgress>
  /**
   * The most words this child has ever known at once, from the profile
   * row. The companion is drawn from this, never from the live count,
   * so nothing they have earned is taken away when a word slips a box. `0` for a profile saved before the column existed,
   * which `highWaterKnown` seeds from what they know today.
   */
  bestKnown?: number
  /**
   * The island this child was last on, from the `lastSet:<profileId>`
   * setting -- null for a child who has not played one yet, or whose
   * last session predates the setting. See `currentSet` for what stands
   * in when it is absent.
   */
  lastSetId?: number | null
  /**
   * The island this child's class is working on, from the
   * `schoolSet:<profileId>` setting a parent writes in the parent area.
   * Null -- the normal state -- and the map is exactly as it was.
   */
  schoolSetId?: number | null
  /**
   * Whether an adult is sitting with this child, from the
   * `grownUp:<profileId>` setting. It changes who judges a Read it
   * round, and nothing else -- see `GrownUpToggle`.
   */
  grownUpHere?: boolean
}

type View = 'map' | 'session' | 'cards'

function metWords(sets: WordSet[], progress: Map<string, WordProgress>): Word[] {
  return sets.flatMap((s) => s.words).filter((w) => progress.has(w.id))
}

async function persist(body: Record<string, unknown>) {
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // A dropped save must never stop a child mid-game; the ladder state
    // stays correct in memory for the rest of this sitting.
  }
}

/**
 * The family-mode play surface for one named profile. Same session
 * engine and set map as guest play, but progress is loaded from and
 * saved back to the family database via `/api/progress` instead of
 * sessionStorage.
 */
export function FamilyPlay({
  profileId, profileName, profileAvatar, sets, initialProgress,
  bestKnown: savedBest, lastSetId, schoolSetId, grownUpHere = false,
}: Props) {
  const [progress, setProgress] = useState<Map<string, WordProgress>>(
    () => new Map(Object.entries(initialProgress)),
  )
  const [view, setView] = useState<View>('map')
  // Seeded from the stored setting: a parent who sat down for the
  // evening should not have to say so again after every session.
  const [grownUp, setGrownUp] = useState(grownUpHere)
  const [sessionWords, setSessionWords] = useState<Word[] | null>(null)
  /** Which go of this sitting is running -- see `playAgain`. */
  const [go, setGo] = useState(0)
  // Seeded from the stored setting rather than from nothing: the island
  // they were last on has to survive a reload, or the map puts the
  // companion and the next session back on Set 1 whatever they played.
  const [currentSetId, setCurrentSetId] = useState<number | undefined>(
    lastSetId ?? undefined,
  )

  // The island a session belongs to, so its own words lead it and words
  // from elsewhere arrive as capped review -- see `SessionRunner.islandWordIds`.
  const sessionIslandWordIds = useMemo(
    () => new Set(
      (sets.find((s) => s.id === currentSetId)?.words ?? []).map((w) => w.id),
    ),
    [sets, currentSetId],
  )
  // The high-water mark of known words: what the sticker book and the
  // companion are drawn from. Seeded from the live count for a profile
  // that has never stored one, so an existing child sees on this visit
  // exactly what they saw on the last.
  const [best, setBest] = useState(() =>
    highWaterKnown(
      savedBest,
      Object.values(initialProgress).filter((p) => p.stage === 'known').length,
    ),
  )

  const allMet = metWords(sets, progress)
  // Every island finished -- the one end this app has. The islands stay
  // tappable underneath it: a child who knows them all may still want
  // to play, and nothing here is a door closing.
  const knowsThemAll = sets.length > 0
    && sets.every((s) => isSetFullyKnown(s.words, progress))

  const here = currentSet(sets, progress, currentSetId)

  // A parent may have recorded their own voice for some words since the
  // last visit -- pick that up once per mount rather than baking it
  // into the initial server render.
  useEffect(() => {
    fetch('/api/parent/voice')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { wordIds?: string[] } | null) => {
        if (data?.wordIds) setVoiceOverrides(data.wordIds)
      })
      .catch(() => {
        // A parent voice is a nice-to-have; its absence must never stop play.
      })
  }, [])

  /**
   * Tapping an island starts the session. Nothing sits between the two
   * any more: the chooser offered seven pictures of one activity, and
   * what it actually taught a child was to pick the same tile every
   * time.
   */
  function startSet(setId: number) {
    const set = sets.find((s) => s.id === setId)
    if (!set) return
    const words = sessionPool(set.words, allMet)
    setCurrentSetId(setId)
    // Written as the session starts, so a reload comes back to this
    // island rather than to the first one under the move-on threshold.
    void persist({ profileId, lastSetId: setId })
    setSessionWords(words)
    setView('session')
  }

  /**
   * Leave a running session and go back to the map -- the quiet Back
   * `SessionRunner` draws above the round pips.
   *
   * Nothing is undone. `progress` here is the map every answer has
   * already been folded into, and each of those answers was written to
   * `/api/progress` as it happened, so the ladder, the streaks and any
   * sticker crossed on the way all stand. The map re-renders from that
   * same state, which is why a child who leaves sees the progress they
   * just earned rather than the progress they started with.
   */
  function leaveSession() {
    setSessionWords(null)
    setView('map')
  }

  /**
   * One card answered in a Cards run -- the same judgement a Read it
   * round asks for, recorded the same way. "They read it" is unaided and
   * promotes; being told is a hint and does not. The day floor inside
   * `recordCorrect` still applies, so going through the deck twice in an
   * evening cannot run a word up the ladder.
   */
  function handleCardRead(word: Word, alone: boolean) {
    const current = progress.get(word.id) ?? newProgress(word.id)
    // Read unaided, and the ordinary ladder credits it -- day floor and
    // all. Needing to be told is a miss, recorded through the same
    // channel a wrong tap uses, or the cards could only ever push words
    // up and a word failed every evening would still read as known.
    //
    // The new-word cap is deliberately not applied: it exists because a
    // session shows a brand-new word and then asks for it, which is
    // recognition of something just seen. An adult hearing a word read
    // from print is not that, whatever box it is on.
    const scored = alone
      ? recordReadToAdult(recordCorrect(current, false, dayKey(), true))
      : recordMiss(current, false)
    // The review schedule belongs to the sessions. A card run is an
    // assessment taken outside them -- no `decrementDue` pass runs after
    // it -- so resetting the interval here would push these words further
    // out every evening and they would stop coming back as review.
    const next = applyStruggleRules({ ...scored, dueInSessions: current.dueInSessions })
    setProgress((prev) => new Map(prev).set(word.id, next))
    void persist({ profileId, progress: next })
    // The companion is drawn from the high-water mark, so a word that
    // reaches box 5 on the cards must raise it here too -- otherwise it
    // lags until the next session happens to end.
    const known = [...progress.values()].filter((p) => p.stage === 'known').length
      + (next.stage === 'known' && current.stage !== 'known' ? 1 : 0)
    if (known > best) {
      setBest(known)
      void persist({ profileId, bestKnown: known })
    }
  }

  function handleProgressChange(p: WordProgress) {
    setProgress((prev) => {
      const next = new Map(prev)
      next.set(p.wordId, p)
      return next
    })
    void persist({ profileId, progress: p })
  }

  // Persists the session's final progress only -- see the matching
  // comment in `GuestHome` for why this must never itself change
  // `view`. The map only comes back once the child taps "Continue".
  function handleComplete(all: Map<string, WordProgress>) {
    setProgress(all)
    const known = [...all.values()].filter((p) => p.stage === 'known').length
    setBest(Math.max(best, known))
    // Written, not merely held. Each answer is saved as it is given, but
    // the review countdown for every word is decremented when the session
    // ends, and that was only ever set in React state -- so the schedule
    // in the database never moved, every word stayed due forever, and the
    // spaced repetition this app is built on did nothing across reloads.
    void persist({ profileId, progressBatch: [...all.values()] })
  }

  /**
   * The high-water mark rose mid-session. Stored at once, beside the
   * answer that raised it, so a child who closes the tab keeps it.
   */
  function handleBestKnown(mark: number) {
    setBest((prev) => Math.max(prev, mark))
    // Written on its own rather than riding along with the next answer:
    // the rise can come on the very last round of a session, and a mark
    // that waits for an answer that never comes is a sticker lost.
    void persist({ profileId, bestKnown: mark })
  }

  function continueFromCelebration() {
    setSessionWords(null)
    setView('map')
  }

  /**
   * Another go on the same island, from live progress and re-shuffled.
   *
   * Counted, and the count is `SessionRunner`'s `key`, because a go is
   * planned once on mount: without a remount the second go would replay
   * the first go's plan, at the first go's boxes, in the first go's
   * order. Nothing else about it is special -- it is the same call the
   * map makes, with the island they are already on.
   */
  function playAgain() {
    if (currentSetId === undefined) return
    setGo((n) => n + 1)
    startSet(currentSetId)
  }

  if (view === 'cards' && here) {
    // The same wrapper every other view uses. Returned bare, it landed
    // as a direct child of `body` and laid itself out against the whole
    // viewport -- 316px of content centred in 1000px, with a third of
    // the screen empty above it and a third below.
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-6">
        <CardRun
          words={here.words}
          onRead={handleCardRead}
          onDone={() => setView('map')}
        />
      </main>
    )
  }

  if (view === 'session' && sessionWords) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-[clamp(1rem,5vh,3rem)] px-6 py-6">
        <SessionRunner
          key={go}
          words={sessionWords}
          islandWordIds={sessionIslandWordIds}
          initialProgress={progress}
          onProgressChange={handleProgressChange}
          onComplete={handleComplete}
          onContinue={continueFromCelebration}
          onAgain={currentSetId === undefined ? undefined : playAgain}
          onLeave={leaveSession}
          bestKnown={best}
          onBestKnownChange={handleBestKnown}
          grownUp={grownUp}
        />
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-evenly gap-6 px-6 py-10">
      {/*
        Back and the child's name share a row in normal flow. Absolutely
        positioned in the top-left corner it was the last of the three
        controls pinned to a page corner, all of which were measured
        drawn through their neighbours on a phone -- and a corner-pinned
        control also sits under the home indicator on an installed PWA.
      */}
      <div className="w-full max-w-2xl flex flex-wrap items-center gap-4">
        <Link
          href="/"
          aria-label="Back to who's playing"
          style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
          className="flex items-center gap-1 justify-center px-4
            rounded-clay border-2 border-border text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold
            text-muted-foreground cursor-pointer select-none
            hover:text-foreground
            focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
        >
          <ArrowLeftIcon aria-hidden="true" weight="bold" size={20} />
          Back
        </Link>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-4">
          <Avatar avatar={profileAvatar} size={56} />
          <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold truncate">{profileName}</h1>
        </div>
      </div>

      <ProgressMap
        sets={sets}
        progress={progress}
        onPickSet={startSet}
        currentSetId={currentSetId}
        schoolSetId={schoolSetId}
        companionStage={companionStage(best)}
      />

      {knowsThemAll && <KnowThemAll stage={companionStage(best)} />}

      <GrownUpToggle
        here={grownUp}
        onChange={(next) => {
          setGrownUp(next)
          void persist({ profileId, grownUp: next })
        }}
      />

      {grownUp && here && (
        <button
          type="button"
          onClick={() => setView('cards')}
          style={{ minHeight: ADULT_TARGET_PX }}
          className="rounded-clay border-2 border-border bg-card px-5 text-sm font-semibold
            text-muted-foreground cursor-pointer select-none hover:text-foreground
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          Go through {here.name}&rsquo;s cards
        </button>
      )}

      <IslandWords sets={sets} hereId={here?.id} schoolSetId={schoolSetId} />
    </main>
  )
}
