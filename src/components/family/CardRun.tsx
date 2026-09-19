'use client'
import { useState } from 'react'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { WordTile } from '@/components/clay/WordTile'
import { useAudio } from '@/lib/audio/player'
import { shuffled } from '@/lib/engine/session'
import { wordAudioUrl } from '@/lib/audio/manifest'
import { ADULT_TARGET_PX } from '@/lib/constants'
import type { Word } from '@/lib/words/types'

/**
 * The island's words, one per screen, for a grown-up to go through.
 *
 * This is the school's own routine and the school's own test, and it is
 * deliberately not a game. InitiaLit-Foundation's lesson says "shuffle
 * Tricky Word Cards and present again, alternating between group and
 * individual responses", and its progress monitoring is a list of those
 * words read aloud from print. A parent who wants to know what them
 * teacher will find out on Friday cannot learn it from a session of
 * matching games, and should not have to play one to find out.
 *
 * So: no rounds, no budget, no rotation, no reward. Every word on the
 * island in turn, the word alone with no sound, and two adult controls.
 * It is the same judgement a Read it round asks for and it is recorded
 * the same way -- "They read it" is unaided and promotes, "Tell them"
 * speaks the word and does not. The ordinary day floor still applies, so
 * going through the cards twice in an evening cannot run a word up the
 * ladder.
 *
 * Shuffled, because a child who has met these in one order learns the
 * order. Nothing here can be failed and nothing is scored: at the end it
 * says how many they read on their own, which is what the teacher's sheet
 * says too.
 */
interface Props {
  words: Word[]
  onRead: (word: Word, alone: boolean) => void
  onDone: () => void
}

export function CardRun({ words, onRead, onDone }: Props) {
  const { speak } = useAudio()
  // Shuffled once, on mount: re-shuffling on each render would move the
  // deck under the adult mid-run. Through `shuffled`, because
  // `sort(() => Math.random() - 0.5)` is biased towards the original
  // order -- which is the one thing shuffling here is for, since a child
  // who meets these in one order learns the order.
  const [deck] = useState(() => shuffled(words, Math.random))
  const [at, setAt] = useState(0)
  const [alone, setAlone] = useState(0)

  const word = deck[at]

  function answer(readAlone: boolean) {
    onRead(word, readAlone)
    if (readAlone) setAlone((n) => n + 1)
    else speak(wordAudioUrl(word.audioId))
    setAt((n) => n + 1)
  }

  if (word === undefined) {
    return (
      <div
        data-testid="card-run-done"
        className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center"
      >
        <p className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold">
          {alone} of {deck.length} read on their own
        </p>
        <p className="max-w-md text-muted-foreground leading-normal">
          The rest are the ones worth another go tomorrow. Nothing here is a mark.
        </p>
        <button
          type="button"
          onClick={onDone}
          style={{ minHeight: ADULT_TARGET_PX }}
          className="rounded-clay border-2 border-transparent bg-primary text-on-primary
            px-5 font-semibold cursor-pointer select-none
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="card-run"
      /*
        `w-full` or the header row collapses: its parent is `items-center`,
        so without it this column shrink-wraps to its widest child and the
        row's own `w-full max-w-2xl` resolves against that -- measured,
        Stop and the card count sat bunched together in the middle rather
        than at either end of the card.
      */
      className="flex w-full flex-1 flex-col items-center justify-center
        gap-[clamp(1rem,4vh,2rem)] p-6"
    >
      <div className="w-full max-w-2xl flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onDone}
          aria-label="Stop the cards"
          style={{ minHeight: ADULT_TARGET_PX }}
          className="flex items-center gap-1 rounded-clay border-2 border-border px-4
            text-sm font-semibold text-muted-foreground cursor-pointer select-none
            hover:text-foreground
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          <ArrowLeftIcon aria-hidden="true" weight="bold" size={18} />
          Stop
        </button>
        <p className="text-sm font-semibold text-muted-foreground">
          Card {at + 1} of {deck.length}
        </p>
      </div>

      <div data-testid="card-run-word">
        <WordTile word={word} showTricky size="lg" />
      </div>

      <p className="max-w-md text-center text-muted-foreground leading-normal">
        Ask them: <strong className="text-foreground">what word?</strong>
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={() => answer(true)}
          style={{ minHeight: ADULT_TARGET_PX }}
          className="rounded-clay border-2 border-transparent bg-primary text-on-primary
            px-5 font-semibold cursor-pointer select-none
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          They read it
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          aria-label="Tell them the word"
          style={{ minHeight: ADULT_TARGET_PX }}
          className="rounded-clay border-2 border-border bg-card text-muted-foreground
            px-5 font-semibold cursor-pointer select-none hover:text-foreground
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          Tell them
        </button>
      </div>
    </div>
  )
}
