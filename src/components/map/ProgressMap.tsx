'use client'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { CheckCircleIcon, CircleDashedIcon, PlayIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import { MAX_BOX } from '@/lib/engine/ladder'
import { currentSet, isSetFullyKnown } from '@/lib/engine/unlock'
import { Companion } from '@/components/companion/Companion'
import type { CSSProperties } from 'react'
import type { CompanionStage } from '@/lib/rewards'
import type { WordSet } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  sets: WordSet[]
  progress: Map<string, WordProgress>
  onPickSet: (setId: number) => void
  /** The set the child most recently played, if any. */
  currentSetId?: number
  /**
   * The island this child's **class** is working on, where an adult has
   * said which -- a different fact from where the child is, and marked
   * differently. Both have to be readable at a glance: the operator's
   * case is "class is up to level 7 let's practice level 7 then we can
   * go back later", which needs the class's island findable *and* the
   * child's own island still visibly theirs.
   *
   * So: their island keeps the companion and the pulse; the class's island
   * gets a small labelled mark in adult register. It is plainly optional
   * -- left out, the map is exactly as it was -- and it gates nothing,
   * because nothing in this app locks.
   */
  schoolSetId?: number | null
  /**
   * The companion's growth stage. It sits **on** the island the child is
   * on, rather than at the head of the path: at the head it was a
   * decoration above a grid of twelve equal tiles, and a five-year-old
   * had nothing on the map that said "you are here". On the island it
   * says both things at once -- where they are, and how far they have come.
   *
   * Left out, no companion is drawn at all.
   */
  companionStage?: CompanionStage
}

type IslandState = 'not-started' | 'in-progress' | 'complete'

/**
 * The state, in words, for the button's accessible name -- and nothing
 * for an island in progress, because the counts that follow it say it
 * better: "2 of 7 words known, 3 being learned, 2 not met yet" is what
 * "in progress" was standing in for, and more besides.
 */
const STATE_LABEL: Record<IslandState, string> = {
  'not-started': 'not started, ',
  'in-progress': '',
  complete: 'finished, ',
}

// Colour is never the only signal of state — shape and icon carry it too,
// so the map still reads for a child who can't (or doesn't) rely on hue.
const STATE_FILL: Record<IslandState, string> = {
  'not-started': 'bg-card border-dashed',
  'in-progress': 'bg-play border-solid',
  complete: 'bg-primary border-solid',
}

/**
 * The island artwork, one per word set, in the order the set list uses:
 * Set 1 gets the flag, Set 12 the castle tower.
 *
 * Indexed by set id rather than by position, because a set's id is what
 * identifies it (`wordSetSchema`: any positive integer) and a parent can
 * edit the set list in the parent area. A set with no art -- id 13 and
 * up, if someone adds one -- simply renders without a picture: see
 * `islandArt` below.
 */
const ISLAND_ART: Readonly<Record<number, string>> = {
  1: '/islands/island-01-flag.webp',
  2: '/islands/island-02-star.webp',
  3: '/islands/island-03-house.webp',
  4: '/islands/island-04-tree.webp',
  5: '/islands/island-05-lighthouse.webp',
  6: '/islands/island-06-tent.webp',
  7: '/islands/island-07-windmill.webp',
  8: '/islands/island-08-hot-air-balloon.webp',
  9: '/islands/island-09-kite.webp',
  10: '/islands/island-10-rainbow.webp',
  11: '/islands/island-11-treasure-chest.webp',
  12: '/islands/island-12-castle-tower.webp',
}

/** The artwork for a set, or null if this set has none. */
function islandArt(setId: number): string | null {
  return ISLAND_ART[setId] ?? null
}

/**
 * The artwork carries its own pale-blue ground (~#C3E0F0), a little
 * bluer than the page's own #EFF6FF. That is not blended away: each
 * island sits in its own rounded, outlined tile, so twelve tiles of one
 * shade read as a deliberate set rather than as twelve near-misses
 * against the page.
 *
 * `aria-hidden` because the button's `aria-label` already carries the
 * set name and its state in words; the picture would only repeat it.
 * Decorative, so `alt=""` as well -- belt and braces for a screen
 * reader that ignores one or the other.
 */
function IslandArt({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      className="block w-full overflow-hidden rounded-2xl border-2 border-card/70"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={256}
        height={256}
        // Twelve tiles on one screen, and the ones further down the
        // winding path are usually below the fold.
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block w-full h-auto select-none"
      />
    </span>
  )
}

const STATE_TEXT: Record<IslandState, string> = {
  'not-started': 'text-muted-foreground',
  'in-progress': 'text-on-play',
  complete: 'text-on-primary',
}

function StateGlyph({ state }: { state: IslandState }) {
  if (state === 'complete') {
    return <CheckCircleIcon aria-hidden="true" weight="fill" className="w-7 h-7 text-on-primary" />
  }
  if (state === 'in-progress') {
    return <PlayIcon aria-hidden="true" weight="fill" className="w-6 h-6 text-on-play" />
  }
  return <CircleDashedIcon aria-hidden="true" weight="bold" className="w-6 h-6 text-muted-foreground" />
}

function islandState(set: WordSet, progress: Map<string, WordProgress>): IslandState {
  if (isSetFullyKnown(set.words, progress)) return 'complete'
  const started = set.words.some((w) => progress.has(w.id))
  return started ? 'in-progress' : 'not-started'
}

function knownCount(set: WordSet, progress: Map<string, WordProgress>): number {
  return set.words.filter((w) => progress.get(w.id)?.stage === 'known').length
}

/** Words met but not yet known -- the ones being learned right now. */
function learningCount(set: WordSet, progress: Map<string, WordProgress>): number {
  return set.words.filter((w) => {
    const p = progress.get(w.id)
    return p !== undefined && p.stage !== 'known'
  }).length
}

/** Words on the island the child has never had a round on. */
function notMetCount(set: WordSet, progress: Map<string, WordProgress>): number {
  return set.words.filter((w) => !progress.has(w.id)).length
}

/**
 * One word's mark on the island card.
 *
 * The card used to make two claims about a set and the louder one was
 * wrong for a child's purpose: a bar a fifth full, and **`0/5`** beside
 * it. A word counts as known only at the top box, so a child could play
 * a set for a week, move every word up the ladder, and still be shown a
 * zero -- reported as broken three times. The bar said "something
 * happened"; the number said "nothing happened"; a zero is louder than a
 * bar.
 *
 * A count of known words is the wrong idea for a card that has to move
 * every day. What a child needs from it is *I did something*, *it is
 * growing*, *this one is finished* -- and what an adult needs is how
 * many are really known, never inflated. One mark per word does both,
 * because **only the solid mark claims "known"**: a parent counts solid
 * marks (at most seven) faster than reading `4/5`, and a first sitting
 * turns every mark it touched pale, which is the "can you see I played?"
 * the operator kept asking for.
 *
 * Four shades, and the boundaries are the ladder's own:
 *
 *  - `not-met` -- no round on it ever. Hollow.
 *  - `started` -- met, boxes 0-2. Pale. Box 0 is in here on purpose: a
 *    word shown but not yet credited (see `MAX_NEW_WORDS_CREDITED`) has
 *    been met, and the mark says so.
 *  - `nearly` -- boxes 3-4. Deep.
 *  - `known` -- the top box. Solid, in the finished colour.
 *
 * `saidIt` is deliberately not in here. It is not evidence, and a mark
 * would make it look like some.
 */
export type WordMark = 'not-met' | 'started' | 'nearly' | 'known'

export function markFor(p: WordProgress | undefined): WordMark {
  if (p === undefined) return 'not-met'
  if (p.stage === 'known' || p.box >= MAX_BOX) return 'known'
  if (p.box >= 3) return 'nearly'
  return 'started'
}

/**
 * Twelve pixels, four apart, so seven of them are 108px and fit across
 * a 128px card. A hand-edited set with more words wraps rather than
 * overflowing.
 *
 * Hollow is the mark's own outline; pale and deep are the tile's own
 * text colour at two opacities, so they read on the amber in-progress
 * tile and the blue finished one without either tile knowing about
 * them. Solid is the finished blue with a lighter ring, which is what
 * makes it visible on the finished tile it matches.
 */
const MARK_CLASS: Record<WordMark, string> = {
  'not-met': 'border-2 border-current opacity-40',
  started: 'bg-current opacity-40',
  nearly: 'bg-current opacity-75',
  known: 'bg-primary ring-1 ring-white/70',
}

/**
 * Reads `prefers-reduced-motion` once on mount and on subsequent changes,
 * matching the games' own hook so the current-set pulse never overrides
 * a child's motion preference.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

// A wave applied per island, purely with CSS -- no coordinate math, no
// measuring. It repeats every four islands, which reads as a winding
// path rather than a grid once there are three or more columns to wind
// across. At one or two columns it is switched off in CSS (see
// `.island` in globals.css), because there the wave put island 4 above
// island 3 and made a phone read the sets out of order. The dashed
// trail drawn behind the grid (see `TrailPath` below) reinforces the
// same idea independent of exactly where each island lands.
const RISE = ['0rem', '2.25rem', '4.5rem', '2.25rem']
const LEAN: Array<'start' | 'center' | 'end'> = ['start', 'center', 'end', 'center']

/**
 * A purely decorative trail drawn behind the islands. It stretches to
 * fill its container exactly (`preserveAspectRatio="none"`), so it
 * needs no knowledge of how many rows/columns the grid actually laid
 * out -- it reads as "a path" at any height a viewport produces.
 */
function TrailPath() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full -z-10"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <path
        d="M20,0 C20,8 80,8 80,16 S20,24 20,32 S80,40 80,48 S20,56 20,64 S80,72 80,80 S20,88 20,96 L20,100"
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="1.2"
        strokeDasharray="1.5 2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * Twelve islands along a winding path, one per word set — every one of
 * them tappable from day one.
 *
 * These sets are the sequence a child's school sends home, and different
 * children are at different points in it. A child whose homework this
 * week is Set 7 must be able to tap Set 7 immediately, without grinding
 * through sets they were signed off on months ago. So there is no locked
 * state here: fill, border style and an icon carry the sense of a
 * journey (not started / in progress / finished), but nothing is ever
 * out of reach.
 *
 * Each set's illustrated island is the picture on its tile. The art is
 * decorative only -- it never carries state. A finished island and an
 * untouched one show the same picture, and the three states stay
 * readable exactly as before, by icon, border style and fill together.
 *
 * One of the twelve is where the child *is* (see `currentSet`): it
 * pulses, its accessible name says so in words, and the companion sits
 * on it. That used to be marked only after they had played a set this
 * visit, so on arrival the map said nothing at all about where they were.
 */
export function ProgressMap({
  sets, progress, onPickSet, currentSetId, schoolSetId, companionStage,
}: Props) {
  const reducedMotion = useReducedMotion()
  const hereRef = useRef<HTMLButtonElement | null>(null)

  /**
   * Bring the island the child is on into view on load.
   *
   * Twelve islands are 2100px tall on a phone: 9 of the 14 controls sat
   * below the fold with nothing to say so, and a child returning to
   * Set 7 was shown Sets 1 and 2 and left to find their own way down.
   * Runs once on mount only -- scrolling the page later, while a child
   * is looking at it, would be worse than not scrolling at all.
   */
  useEffect(() => {
    // Not implemented in jsdom, and absent in older webviews.
    hereRef.current?.scrollIntoView?.({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Which island the child is on: the one they last played, or else the
   * first they have not finished, or else the last one there is. The same
   * `currentSet` the line under the map uses, so the companion and the
   * words it names can never disagree about where they are.
   *
   * It is also where the page scrolls to on arrival.
   */
  const hereId = currentSet(sets, progress, currentSetId)?.id

  return (
    <div className="w-full max-w-2xl mx-auto px-2" role="group" aria-label="Word set map">
      <div
        className="island-map relative grid gap-y-10 gap-x-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        <TrailPath />
        {sets.map((set, i) => {
          const state = islandState(set, progress)
          const isCurrent = set.id === hereId
          const isSchool = schoolSetId != null && set.id === schoolSetId
          const pulse = isCurrent && !reducedMotion
          const known = knownCount(set, progress)
          const learning = learningCount(set, progress)
          const notMet = notMetCount(set, progress)
          const total = set.words.length
          const art = islandArt(set.id)

          return (
            <div
              key={set.id}
              className="island relative"
              style={{
                '--island-lean': LEAN[i % LEAN.length],
                '--island-rise': RISE[i % RISE.length],
              } as CSSProperties}
            >
              <motion.button
                type="button"
                ref={set.id === hereId ? hereRef : undefined}
                onClick={() => onPickSet(set.id)}
                aria-label={`${set.name}, ${
                  isCurrent ? 'where you are, ' : ''
                }${isSchool ? 'your class is working on this one, ' : ''}${
                  STATE_LABEL[state]}${known} of ${total} words known${
                  learning > 0 ? `, ${learning} being learned` : ''
                }${notMet > 0 ? `, ${notMet} not met yet` : ''}`}
                style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
                animate={pulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                whileTap={{ scale: 0.95 }}
                className={`${STATE_FILL[state]} ${STATE_TEXT[state]} rounded-clay shadow-clay border-4 border-border
                  flex flex-col items-center justify-center gap-1 p-2 w-32
                  cursor-pointer select-none
                  focus-visible:outline-4 focus-visible:outline-offset-4
                  focus-visible:outline-fun`}
              >
                {art !== null && <IslandArt src={art} />}
                <span className="flex items-center gap-1">
                  <StateGlyph state={state} />
                  <span aria-hidden="true" className="font-display font-bold text-[clamp(1rem,1.6vw,1.125rem)] leading-tight">
                    {set.name}
                  </span>
                </span>
                {/*
                  One mark per word, in set order, so the same word is
                  the same dot every day and a child learns "the third
                  one is `she`". It replaces both the `known/total` pill
                  and the progress bar -- see `markFor` for why a count
                  was the wrong idea and why only solid claims "known".

                  `aria-hidden`: the button's own name carries the
                  counts in words, and no number belongs anywhere a
                  child looks.
                */}
                <span
                  aria-hidden="true"
                  data-testid={`island-marks-${set.id}`}
                  className="flex flex-wrap items-center justify-center gap-1 w-full py-0.5"
                >
                  {set.words.map((w) => {
                    const mark = markFor(progress.get(w.id))
                    return (
                      <span
                        key={w.id}
                        data-mark={mark}
                        className={`block w-3 h-3 rounded-full ${MARK_CLASS[mark]}`}
                      />
                    )
                  })}
                </span>
              </motion.button>

              {/*
                The island the class is working on. A small dark chip in
                adult register, at the tile's top-right -- clear of the
                companion, which sits top-centre on *their* island, so the
                two facts never draw over one another and an island that
                is both reads as both.

                `aria-hidden` because the button's own accessible name
                already says it in words.
              */}
              {isSchool && (
                <span
                  data-testid={`school-mark-${set.id}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-2 right-0 z-10
                    rounded-full bg-foreground text-card
                    px-2 py-0.5 text-xs font-semibold shadow-clay"
                >
                  School
                </span>
              )}

              {/*
                The companion, sitting on the island the child is on.
                Decorative here -- the button's own accessible name
                already says "where you are" -- and drawn over the tile's
                top edge so it reads as standing on it rather than
                floating beside it.
              */}
              {isCurrent && companionStage !== undefined && (
                <div
                  data-testid="map-companion"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2
                    -top-16 w-24"
                >
                  <Companion stage={companionStage} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
