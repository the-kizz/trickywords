'use client'
import { useEffect, useRef, useState } from 'react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { RoundHeader } from './RoundHeader'
import { useRoundAudio } from './useRoundAudio'
import { useAudio } from '@/lib/audio/player'
import { phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import type { GameProps } from './types'

/**
 * How long the heart stays on the word once it has landed, before the
 * round resolves.
 *
 * A visual beat, deliberately not a clip length: the point of the round
 * is seeing the heart arrive on the part that is tricky, and a round that
 * unmounted on the tap would show it for a frame. The same reason
 * `REVEAL_HOLD_MS` exists, and the same order of magnitude. The word and
 * "Well done!" are queued on the same tap and play over it; nothing here
 * waits on them, because the queue already keeps them in order.
 */
export const HEART_LAND_MS = 900

/**
 * Where's the heart? -- the child taps the part of the word that does not
 * say its sound, and the heart lands on it.
 *
 * Every other round asks *which word*. This one asks *what is tricky
 * about it*, which is the thing a heart word actually has to be learned
 * for, and it is LLLL's own correction step -- "remind students of the
 * tricky part of the spelling" -- as a round rather than as something
 * that only happens after a mistake. One tap, so it is quick.
 *
 * The word is on screen throughout and that is not a lapse in the
 * show-it-then-hide-it rule: this is not a recognition round, and there
 * is nothing to recognise if the word is not there. The engine only ever
 * gives this round to a word past box 0 that is not struggling, so the
 * errorless reveal does not apply to it -- see `roundTypeFor`.
 *
 * No fail state, and a wrong tap is informative in itself: tapping the
 * `s` of `said` says the child has not located the irregularity, so the
 * word is said again and they are invited to have another go. Nothing on
 * screen says wrong, every tile stays live, and the engine hears about
 * the miss the way it hears about every other one -- see
 * `GameProps.onMiss`.
 */
export function WhereIsTheHeart({ round, onAnswer, onMiss }: GameProps) {
  const { prompted, hearWord, markMissed, celebrate } =
    // `targetsShowWords` is false: the word is drawn by this round itself
    // and must not also be drawn as the header's fading prompt.
    useRoundAudio(round, 'whereIsTheHeart', onMiss, false)
  const { enqueue } = useAudio()
  const [found, setFound] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  // Cleared on unmount: a child who leaves mid-round must not have a
  // round resolve behind them.
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const tricky = new Set(round.word.trickyIndices)

  function tap(index: number) {
    if (found) return
    if (!tricky.has(index)) {
      // The word again, then the invitation, in that order and neither
      // cutting the other off. Queued because the app is speaking, not
      // the child -- see `enqueue`.
      markMissed()
      setNudge('Have another go')
      enqueue([wordAudioUrl(round.word.audioId), phraseAudioUrl('tryAgain')])
      return
    }
    setFound(true)
    celebrate(round.word.audioId)
    timer.current = window.setTimeout(() => onAnswer(true, prompted), HEART_LAND_MS)
  }

  return (
    <div className="flex w-full flex-col items-center justify-center p-4
      gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]">
      <RoundHeader
        round={round}
        instruction="whereIsTheHeart"
        onHearWord={hearWord}
        targetsShowWords={false}
      />

      {/*
        The word, with its hearts hidden until they find one. Drawn
        through `WordTile` so the heart is the one the rest of the app
        draws, in the one place that knows how contiguous tricky
        graphemes group into a single heart (see `trickyRuns`) -- `was`
        gets one heart over its `as`, not two overlapping ones.

        Every heart on the word appears, not only the one they tapped:
        that is the truth about the word, and in `one`, `some` and `come`
        the two irregular parts are both worth seeing.
      */}
      <div data-testid="heart-word">
        <WordTile word={round.word} showTricky={found} size="lg" />
      </div>

      {nudge && !found && (
        <p
          className="text-[clamp(1.125rem,1.6vw,1.25rem)] text-muted-foreground leading-normal"
          role="status"
        >
          {nudge}
        </p>
      )}

      {/*
        The same word split into its graphemes, one 76px tile each, in
        order -- so the answer is a part of the word rather than a
        position they could learn.
      */}
      <div data-testid="heart-parts" className="flex flex-wrap justify-center gap-4">
        {round.word.graphemes.map((g, i) => (
          <ClayButton
            key={`${g}-${i}`}
            tone="primary"
            ariaLabel={g}
            onPress={() => tap(i)}
          >
            <WordTile text={g} />
          </ClayButton>
        ))}
      </div>
    </div>
  )
}
