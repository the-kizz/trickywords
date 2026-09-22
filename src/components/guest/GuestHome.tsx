'use client'
import { useEffect, useMemo, useState } from 'react'
import { ADULT_TARGET_PX, MIN_TARGET_PX } from '@/lib/constants'
import { Avatar, AVATAR_IDS, AVATAR_LABELS } from '@/components/avatar/Avatar'
import { Wordmark } from '@/components/brand/Wordmark'
import { loadGuest, saveGuest, clearGuest, type GuestState } from '@/lib/guest/store'
import { ProgressMap } from '@/components/map/ProgressMap'
import { SessionRunner } from '@/components/SessionRunner'
import { sessionPool } from '@/lib/engine/session'
import { currentSet, isSetFullyKnown } from '@/lib/engine/unlock'
import { KnowThemAll } from '@/components/map/KnowThemAll'
import { IslandWords } from '@/components/map/IslandWords'
import { SchoolSetPicker } from '@/components/map/SchoolSetPicker'
import { GrownUpToggle } from '@/components/map/GrownUpToggle'
import { CardRun } from '@/components/family/CardRun'
import { GROWN_UP_DEFAULT } from '@/lib/teaching'
import { dayKey, newProgress, recordCardRead } from '@/lib/engine/ladder'
import { applyStruggleRules } from '@/lib/engine/strugglers'
import { companionStage } from '@/lib/rewards'
import { useAudio } from '@/lib/audio/player'
import { PHRASES, phraseAudioUrl } from '@/lib/audio/manifest'
import type { WordSet, Word } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  sets: WordSet[]
}

type View = 'avatar' | 'map' | 'session' | 'cards'

const HONESTY_LINE = 'Your progress stays on this device, just for this visit.'

function progressToMap(progress: GuestState['progress']): Map<string, WordProgress> {
  return new Map(Object.entries(progress))
}

function mapToProgress(map: Map<string, WordProgress>): GuestState['progress'] {
  return Object.fromEntries(map)
}

function metWords(sets: WordSet[], progress: Map<string, WordProgress>): Word[] {
  return sets.flatMap((s) => s.words).filter((w) => progress.has(w.id))
}

function readSetParam(sets: WordSet[]): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('set')
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && sets.some((s) => s.id === n) ? n : null
}

/**
 * The public entry point to the app, and also usable from family mode.
 *
 * Never asks a child anything in text -- avatar choice only. State
 * lives only in sessionStorage via `loadGuest`/`saveGuest`/`clearGuest`;
 * nothing here ever calls the server.
 */
export function GuestHome({ sets }: Props) {
  const { speakSequence } = useAudio()
  const [guest, setGuest] = useState<GuestState>(() => loadGuest())
  const [view, setView] = useState<View>(() => (loadGuest().avatar ? 'map' : 'avatar'))
  const [sessionWords, setSessionWords] = useState<Word[] | null>(null)
  /** Which go of this sitting is running -- see `playAgain`. */
  const [go, setGo] = useState(0)
  // Seeded from the guest record, not from nothing: the island they were
  // last on has to survive a refresh, or the map puts the companion and
  // the next session back on Set 1 whatever they were playing.
  const [currentSetId, setCurrentSetId] = useState<number | undefined>(
    () => loadGuest().lastSetId ?? undefined,
  )

  // The island a session belongs to, so its own words lead it and words
  // from elsewhere arrive as capped review -- see `SessionRunner.islandWordIds`.
  const sessionIslandWordIds = useMemo(
    () => new Set(
      (sets.find((s) => s.id === currentSetId)?.words ?? []).map((w) => w.id),
    ),
    [sets, currentSetId],
  )
  const [autoStarted, setAutoStarted] = useState(false)
  // "Start again" wipes the whole visit, so it takes two taps -- see
  // `StartAgainControl` below.
  const [confirmingStartAgain, setConfirmingStartAgain] = useState(false)

  // Computed only after mount, not with useMemo at render time: reading
  // it during the initial render would differ between the server pass
  // (no `window`) and the client pass (a real URL), which is exactly
  // the shape of a React hydration mismatch. Doing it in an effect
  // means the first client render still matches the server's (null),
  // and the real value arrives a tick later as an ordinary state update.
  const [pendingSetFromUrl, setPendingSetFromUrl] = useState<number | null>(null)
  useEffect(() => {
    setPendingSetFromUrl(readSetParam(sets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const progress = progressToMap(guest.progress)
  const allMet = metWords(sets, progress)
  // Every island finished -- the one end this app has. The islands stay
  // tappable underneath it: a child who knows them all may still want
  // to play, and nothing here is a door closing.
  const knowsThemAll = sets.length > 0
    && sets.every((s) => isSetFullyKnown(s.words, progress))

  const here = currentSet(sets, progress, currentSetId)

  function persist(next: GuestState) {
    setGuest(next)
    saveGuest(next)
  }

  /**
   * Tapping an island starts the session -- there is nothing between
   * the two any more. Guest play runs the same round types as family
   * play, and none of them was ever something to choose between.
   */
  /**
   * `fromLink` says this set was named by a shared `?set=N` link rather
   * than tapped on the map. Whoever shared that link was saying "this is
   * the set we are on", so it seeds the class marker -- but only when no
   * adult has set one already, which always wins.
   */
  function startSet(setId: number, fromLink = false) {
    const set = sets.find((s) => s.id === setId)
    if (!set) return
    const words = sessionPool(set.words, allMet)
    setCurrentSetId(setId)
    // Written to the guest record as the session starts, so a refresh
    // mid-visit comes back to this island rather than to Set 1.
    persist({
      ...guest,
      lastSetId: setId,
      schoolSetId: fromLink && guest.schoolSetId === null ? setId : guest.schoolSetId,
    })
    setSessionWords(words)
    setView('session')
  }

  // ?set=N drops a returning (or just-arrived) child straight into that
  // set, once an avatar is in place -- fires once per visit.
  useEffect(() => {
    if (!autoStarted && view === 'map' && pendingSetFromUrl !== null) {
      setAutoStarted(true)
      startSet(pendingSetFromUrl, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pendingSetFromUrl, autoStarted])

  useEffect(() => {
    if (view === 'avatar') {
      speakSequence([phraseAudioUrl('whosPlaying'), phraseAudioUrl('pickYourFriend')])
    }
  }, [view, speakSequence])

  function pickAvatar(id: string) {
    persist({ ...guest, avatar: id })
    setView('map')
  }

  // Null in the stored record means nobody has said, which reads as
  // yes: this app is used with a parent sitting alongside. See
  // `GROWN_UP_DEFAULT`.
  const grownUp = guest.grownUp ?? GROWN_UP_DEFAULT

  /**
   * One card answered in a Cards run. Scored by `recordCardRead`, the
   * same function the family surface uses, so guest play cannot come to
   * a different verdict about the same card.
   */
  function handleCardRead(word: Word, alone: boolean) {
    const current = guest.progress[word.id] ?? newProgress(word.id)
    const next = applyStruggleRules(recordCardRead(current, alone, dayKey()))
    const known = Object.values({ ...guest.progress, [word.id]: next })
      .filter((p) => p.stage === 'known').length
    persist({
      ...guest,
      progress: { ...guest.progress, [word.id]: next },
      bestKnown: Math.max(guest.bestKnown, known),
    })
  }

  function handleProgressChange(p: WordProgress) {
    persist({ ...guest, progress: { ...guest.progress, [p.wordId]: p } })
  }

  // Persists the session's final progress only -- it must never itself
  // change `view`, or the celebration SessionRunner is about to render
  // would be replaced by the map in the very same commit, before the
  // child ever sees it. Returning to the map happens only once the
  // child taps "Continue" -- see `continueFromCelebration`.
  function handleSessionComplete(all: Map<string, WordProgress>) {
    const known = [...all.values()].filter((p) => p.stage === 'known').length
    // The high-water mark, not the live count: a word that slipped back
    // this session must not shrink the companion.
    persist({
      ...guest,
      progress: mapToProgress(all),
      bestKnown: Math.max(guest.bestKnown, known),
    })
  }

  /** The mark rose mid-session. Stored at once -- it only ever rises. */
  function handleBestKnown(mark: number) {
    setGuest((prev) => {
      if (mark <= prev.bestKnown) return prev
      const next = { ...prev, bestKnown: mark }
      saveGuest(next)
      return next
    })
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

  /**
   * Leave a running session for the map, the same quiet Back the family
   * surface has. Non-destructive, and nothing like "Start again": every
   * answer was persisted to the guest record as it was given, so the
   * visit -- progress, avatar, stickers -- is exactly as the child left
   * it, minus only the rounds they chose not to play.
   */
  function leaveSession() {
    setSessionWords(null)
    setView('map')
  }

  function startAgain() {
    clearGuest()
    setGuest(loadGuest())
    setSessionWords(null)
    setCurrentSetId(undefined)
    setAutoStarted(false)
    setConfirmingStartAgain(false)
    setView('avatar')
  }



  const quietButton = `flex items-center justify-center px-6 rounded-clay
    bg-muted border-2 border-border text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold
    text-muted-foreground cursor-pointer select-none
    hover:text-foreground
    focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun`

  /**
   * "Start again" hands the device to the next visitor: it clears the
   * whole guest record -- progress, avatar, companion -- and there is no
   * undo, because there is nowhere to undo it from.
   *
   * So it takes **two** taps, and it lives **here, on the map**, not in
   * the session view. It used to sit 56px directly below the answer
   * buttons of a live round, which is the single most likely place in
   * the whole app for a five-year-old's finger to land by mistake: one
   * stray tap and the visit was gone. Now a first tap only asks, and
   * the destructive tap is a second, differently-worded control that
   * has never been under a child's finger a moment earlier.
   *
   * The wording stays plain and unalarming -- a child may well read (or
   * be read) this. Nothing here warns, threatens or blames; "No, keep
   * playing" is offered as the equal and obvious other half.
   */
  const StartAgainControl = (
    <div data-testid="start-again" className="flex flex-col items-center gap-3">
      {confirmingStartAgain ? (
        <>
          <p
            role="status"
            className="text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold text-center leading-normal"
          >
            Start again for someone new?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-testid="start-again-confirm"
              onClick={startAgain}
              style={{ minHeight: MIN_TARGET_PX }}
              className={quietButton}
            >
              Yes, start again
            </button>
            <button
              type="button"
              data-testid="start-again-cancel"
              onClick={() => setConfirmingStartAgain(false)}
              style={{ minHeight: MIN_TARGET_PX }}
              className={quietButton}
            >
              No, keep playing
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          data-testid="start-again-ask"
          onClick={() => setConfirmingStartAgain(true)}
          style={{ minHeight: MIN_TARGET_PX }}
          className={quietButton}
        >
          Start again
        </button>
      )}
    </div>
  )

  const HonestyLine = (
    <p className="text-[clamp(1.125rem,1.6vw,1.25rem)] text-muted-foreground text-center leading-normal max-w-sm">{HONESTY_LINE}</p>
  )

  if (view === 'avatar') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        {/* Same treatment as the family home -- see the comment there. */}
        <h1 className="w-full flex justify-center">
          <Wordmark className="max-w-[min(20rem,72vw)]" />
        </h1>
        <p className="text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold text-muted-foreground leading-normal text-center" role="status">
          {PHRASES.whosPlaying} {PHRASES.pickYourFriend}
        </p>
        <div
          role="group"
          aria-label="Choose your avatar"
          className="flex flex-wrap justify-center gap-6"
        >
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`avatar-${id}`}
              aria-label={AVATAR_LABELS[id]}
              onClick={() => pickAvatar(id)}
              style={{ minWidth: MIN_TARGET_PX * 1.4, minHeight: MIN_TARGET_PX * 1.4 }}
              className="flex items-center justify-center rounded-clay bg-card shadow-clay
                border-4 border-border cursor-pointer select-none
                focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
            >
              <Avatar avatar={id} size={64} />
            </button>
          ))}
        </div>
        {pendingSetFromUrl !== null && (
          // A shared link (`?set=N`) names a set before a child has even
          // picked their avatar -- confirm it took, so whoever followed
          // the link (often a caregiver, not the child) can see it
          // worked before handing the device over. The set itself
          // starts automatically once an avatar is chosen.
          <p role="status" className="text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold text-muted-foreground text-center">
            Ready to play {sets.find((s) => s.id === pendingSetFromUrl)?.name}
          </p>
        )}
        {HonestyLine}
      </main>
    )
  }

  if (view === 'cards' && here) {
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
      /*
       * Nothing but the round. "Start again" used to sit here, one
       * stray tap below the answers, and wiped the whole visit -- it
       * now lives on the map, two taps deep (see `StartAgainControl`).
       */
      <main className="flex flex-1 flex-col items-center justify-center gap-[clamp(1rem,5vh,3rem)] px-6 py-6">
        <SessionRunner
          key={go}
          grownUp={grownUp}
          words={sessionWords}
          islandWordIds={sessionIslandWordIds}
          initialProgress={progress}
          onProgressChange={handleProgressChange}
          onComplete={handleSessionComplete}
          onContinue={continueFromCelebration}
          onAgain={currentSetId === undefined ? undefined : playAgain}
          onLeave={leaveSession}
          bestKnown={guest.bestKnown}
          onBestKnownChange={handleBestKnown}
        />
      </main>
    )
  }

  return (
    <main className="relative flex flex-1 flex-col items-center justify-evenly gap-6 px-6 py-10">
      <div className="flex items-center gap-4">
        {guest.avatar && <Avatar avatar={guest.avatar} size={56} />}
      </div>

      <ProgressMap
        sets={sets}
        progress={progress}
        onPickSet={startSet}
        currentSetId={currentSetId}
        schoolSetId={guest.schoolSetId}
        companionStage={companionStage(guest.bestKnown)}
      />

      {knowsThemAll && <KnowThemAll stage={companionStage(guest.bestKnown)} />}

      <GrownUpToggle
        here={grownUp}
        onChange={(next) => persist({ ...guest, grownUp: next })}
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

      <IslandWords sets={sets} hereId={here?.id} schoolSetId={guest.schoolSetId}>
        <SchoolSetPicker
          sets={sets}
          value={guest.schoolSetId}
          onChange={(setId) => persist({ ...guest, schoolSetId: setId })}
        />
      </IslandWords>

      {StartAgainControl}
      {HonestyLine}
    </main>
  )
}
