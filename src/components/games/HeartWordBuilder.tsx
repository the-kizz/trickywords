'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { RoundHeader } from './RoundHeader'
import { useRoundAudio } from './useRoundAudio'
import type { GameProps } from './types'
import type { Round } from '@/lib/engine/session'
import type { Word } from '@/lib/words/types'

const DECOYS = ['b', 'ee', 'k', 'oo', 'p', 'sh', 't', 'ay']

// A permanently fixed tile layout would let a child learn "tap the third
// one, then the first" as a motor sequence instead of attending to which
// grapheme is which — exactly the positional shortcut this game exists to
// rule out. Each round gets its own deterministic seed (assigned once per
// Round object, the first time it is seen) so the arrangement differs
// between encounters of the same word but never moves mid-round.
let nextRoundSeed = 0
const roundSeeds = new WeakMap<Round, number>()
function seedFor(round: Round): number {
  let seed = roundSeeds.get(round)
  if (seed === undefined) {
    seed = nextRoundSeed++
    roundSeeds.set(round, seed)
  }
  return seed
}

/**
 * The orthographic-mapping activity: the child builds the word grapheme
 * by grapheme, and the irregular part is marked with a heart as it lands.
 *
 * Tapping the wrong tile does nothing the child can see — no penalty, no
 * message, nothing added to the word. Doing nothing is the gentlest
 * possible correction, and it keeps a child exploring rather than
 * guarding against mistakes.
 *
 * The engine is told about *some* of those taps, through `onMiss`: the
 * word has been spoken and, while support is high, was shown in writing
 * before the tiles appeared, so reaching for a grapheme of this word out
 * of order is a real error of recognition and is how a struggling word
 * gets noticed. A tap on a decoy is not. A child finding out which tiles
 * are even in play is exploring, and it was costing them the word: a
 * fumble among seven tiles counted the same as a misread.
 */
export function HeartWordBuilder({ round, onAnswer, onMiss }: GameProps) {
  const {
    prompted, hearWord, markMissed, sayWord, say, celebrate, revealPhase, asking,
  } = useRoundAudio(round, 'buildTheWord', onMiss, true)
  const [placed, setPlaced] = useState(0)

  // One timer, cleared on unmount: the round is held open for the length
  // of the celebration, and a child who leaves during it must not have
  // `onAnswer` fire into an unmounted round.
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  // The word so far, as a word in its own right, so the hearts land on
  // the graphemes already placed and nowhere else.
  const built: Word = {
    ...round.word,
    graphemes: round.word.graphemes.slice(0, placed),
    trickyIndices: round.word.trickyIndices.filter((i) => i < placed),
  }

  const tiles = useMemo(() => {
    const needed = round.word.graphemes
    const extras = DECOYS.filter((d) => !needed.includes(d)).slice(0, 3)
    const all = [...needed, ...extras]
    const seed = seedFor(round)
    // Deterministic shuffle keyed on each grapheme's own characters, its
    // position, and a per-round seed — reproducible for a given round
    // (so a tile never moves under a child's finger mid-tap) but varies
    // between rounds, following the same pattern as ListenAndFind's
    // choice-button shuffle. The seed is multiplied by the position so
    // it shifts each tile's key by a different amount: added on its own,
    // it moved every key by the same step and so left the order
    // unchanged for many pairs of consecutive rounds.
    return all
      .map((g, i) => {
        const chars = g.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0)
        return { g, k: (chars * 31 + i * 17 + seed * (i + 1)) % all.length }
      })
      .sort((a, b) => a.k - b.k)
      .map(({ g }) => g)
  }, [round])

  function tap(g: string) {
    if (g !== round.word.graphemes[placed]) {
      // Only a piece that genuinely belongs to this word, reached for
      // out of order, is a misread. A tap on a decoy is a child working
      // out which tiles are even in play -- exploring, not failing --
      // and it used to count against them: a fumble on a seven-tile word
      // like `little` (l / i / tt / le plus three decoys) sent the word
      // to box 0. Nothing visible changes either way: the built word is
      // untouched and every tile stays live. See `GameProps.onMiss`.
      if (round.word.graphemes.includes(g)) markMissed()
      return
    }
    const next = placed + 1
    setPlaced(next)
    if (next === round.word.graphemes.length) {
      // The whole word, then the celebration, queued so each waits for the
      // one before. This used to say the word and set a 600ms timer for
      // "Well done!" -- by which time `onAnswer` had started the next
      // round, whose instruction and word were already queued, and an
      // interrupting celebration threw them away. The round after every
      // Build the Word therefore played in silence.
      // Held for exactly as long as the celebration sounds. The audio was
      // already in the right order -- `enqueue` sees to that -- but the
      // screen was not: `onAnswer` mounted the next round's word while
      // "Well done!" was still being said, so a child saw the next word
      // before they had finished being told they got this one right.
      const ms = celebrate(round.word.audioId)
      timer.current = window.setTimeout(() => onAnswer(true, prompted), ms)
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center p-4
      gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]">
      <RoundHeader
        round={round}
        instruction="buildTheWord"
        onHearWord={hearWord}
        targetsShowWords
        revealPhase={revealPhase}
      />

      {/*
        The word as it is being built, through `WordTile` so the
        heart-marking is the one implementation the rest of the app
        uses rather than a second copy of it here.

        Each grapheme still to come is an empty slot beside it. Without
        them the round opened on nothing at all -- an unreadable
        instruction, a speaker and a row of tiles, with a blank gap where
        the word goes, because a word built from no graphemes renders as
        nothing. A child could not see what was being asked, how many
        pieces it took, or where they went. The slots say all three
        without saying the answer: they give the word's length and the
        left-to-right order, while which grapheme belongs in each is
        still the thing to work out.
      */}
      <div
        data-testid="built"
        className="min-h-[clamp(5rem,12vw,8rem)] flex items-end justify-center gap-2"
      >
        <WordTile word={built} showTricky size="lg" />
        {round.word.graphemes.slice(placed).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            // Square, tile-sized, and in the text colour rather than the
            // border colour: `--color-border` is #E4ECFC against a near-white
            // page, which measured as all but invisible -- on a phone the
            // slots read as a smudge and a child could not see that anything
            // went there. Slate at 45% is plainly a dashed outline, and
            // matching a tile's footprint says what fills it.
            className="inline-block rounded-clay border-4 border-dashed
              border-muted-foreground/45 bg-white/60
              w-[clamp(4rem,9vw,5.5rem)] h-[clamp(4rem,9vw,5.5rem)]"
          />
        ))}
      </div>

      {/*
        The tiles wait for the whole word to have been shown, said and
        taken away (`asking` -- see `useRoundAudio` rule 4). With the
        word above them the game was copying letter by letter; after it,
        the child is reproducing a form they are holding in their head.
      */}
      {asking && (
        <div data-testid="tiles" className="flex flex-wrap justify-center gap-4">
          {tiles.map((g, i) => (
            <ClayButton key={`${g}-${i}`} tone="primary" ariaLabel={g} onPress={() => tap(g)}>
              <WordTile text={g} />
            </ClayButton>
          ))}
        </div>
      )}
    </div>
  )
}
