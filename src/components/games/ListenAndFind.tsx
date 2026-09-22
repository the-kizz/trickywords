'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { RoundHeader } from './RoundHeader'
import { ChestReveal, CHEST_REVEAL_BOX, CHEST_REVEAL_MS } from './ChestReveal'
import { SentenceMoment, SENTENCE_BOX } from './SentenceMoment'
import { useRoundAudio } from './useRoundAudio'
import type { GameProps } from './types'

/**
 * Where a correct round is once the child has tapped the right word.
 *
 * Both of these are *moments*, not games: nothing in either can be
 * tapped, nothing in either can be got wrong, and the answer has already
 * been given by the time they appear. They are what the two cut games
 * were actually right about -- Treasure Hunt's reveal and Spot the
 * Word's sentence -- kept as the reward for being right rather than as
 * separate activities wearing the same mechanic.
 */
type Closing =
  /** Still choosing. */
  | 'asking'
  /** The chest, at box 3 and up. */
  | 'chest'
  /** The sentence, read aloud with the word lit, at box 2 and up. */
  | 'sentence'

/**
 * Hear the word, find it among a few others -- the one act this app is
 * built on, and now the only round type that asks a child to choose.
 *
 * A correct tap is followed by whichever of the two closing moments the
 * word has earned (see `Closing`), and only then does the round resolve.
 * A wrong tap is an invitation, never a correction: the round stays
 * open, every control stays live, and nothing on screen says "wrong".
 */
export function ListenAndFind({ round, onAnswer, onMiss }: GameProps) {
  const {
    prompted, hearWord, markMissed, say, nudgeThenWord, revealPhase, asking,
  } = useRoundAudio(round, 'findTheWord', onMiss, true)
  const [nudge, setNudge] = useState<string | null>(null)
  const [closing, setClosing] = useState<Closing>('asking')
  // The prompting flag as it stood when the answer was given. The closing
  // moments take time, and nothing that happens during them may change
  // what the answer was worth.
  const answeredPrompted = useRef(false)
  // One timer at a time, cleared on unmount: a child who leaves mid-round
  // must not have a round resolve behind them.
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const choices = useMemo(() => {
    const all = [round.word, ...round.distractors]
    // Deterministic shuffle keyed on the word, so a re-render never moves
    // the buttons under a child's finger mid-tap.
    return all
      .map((w, i) => ({ w, k: (w.text.charCodeAt(0) * 31 + i) % all.length }))
      .sort((a, b) => a.k - b.k)
      .map(({ w }) => w)
  }, [round])

  /** When "Well done!" will have finished sounding. See `resolve`. */
  const praiseEndsAt = useRef(0)

  function resolve() {
    // Only the handover to the next round waits, and only for whatever is
    // left of the praise. The audio was always ordered correctly -- the
    // next round queues behind this one -- but the screen was not, so the
    // next word appeared while "Well done!" was still being said.
    //
    // The chest and the sentence do not wait: they belong to this round,
    // are part of the same celebration, and holding them back would only
    // put a gap in the middle of it.
    const left = Math.max(0, praiseEndsAt.current - Date.now())
    if (left === 0) {
      onAnswer(true, answeredPrompted.current)
      return
    }
    timer.current = window.setTimeout(
      () => onAnswer(true, answeredPrompted.current), left,
    )
  }

  /** The sentence, if the word has earned one; otherwise the round is over. */
  function afterChest() {
    if (round.box >= SENTENCE_BOX) setClosing('sentence')
    else resolve()
  }

  function choose(id: string) {
    if (closing !== 'asking') return
    if (id === round.word.id) {
      answeredPrompted.current = prompted
      praiseEndsAt.current = Date.now() + say('wellDone')
      if (round.box >= CHEST_REVEAL_BOX) {
        setClosing('chest')
        timer.current = window.setTimeout(afterChest, CHEST_REVEAL_MS)
        return
      }
      afterChest()
      return
    }
    // A miss is an invitation, never a correction. The round stays open,
    // support becomes explicit, and nothing on screen says "wrong".
    markMissed()
    setNudge('Have another go')
    // The invitation, then the word again -- waited out rather than
    // guessed at. See `nudgeThenWord`.
    nudgeThenWord('tryAgain')
  }

  return (
    <div className="flex w-full flex-col items-center justify-center p-4
      gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]">
      <RoundHeader
        round={round}
        instruction="findTheWord"
        onHearWord={hearWord}
        targetsShowWords
        revealPhase={revealPhase}
      />

      {nudge && closing === 'asking' && (
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[clamp(1.125rem,1.6vw,1.25rem)] text-muted-foreground leading-normal"
          role="status"
        >
          {nudge}
        </motion.p>
      )}

      {closing === 'chest' && <ChestReveal />}

      {closing === 'sentence' && (
        <SentenceMoment word={round.word} onDone={resolve} />
      )}

      {/*
        The choices wait for the word to have been shown, said and taken
        away again (`asking` -- see `useRoundAudio` rule 4). Side by side
        with the written word they were a shape match, which is faster
        than listening and always works; a beat after it, the tap is a
        small act of memory.

        They go once the answer is in, so the closing moment has the
        screen to itself and a second tap cannot land on a round that is
        already over.
      */}
      {asking && closing === 'asking' && (
        <div data-testid="choices" className="flex flex-wrap justify-center gap-6">
          {choices.map((w) => (
            <ClayButton key={w.id} tone="primary" ariaLabel={w.text} onPress={() => choose(w.id)}>
              <WordTile word={w} size="lg" />
            </ClayButton>
          ))}
        </div>
      )}
    </div>
  )
}
