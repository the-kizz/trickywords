'use client'
import { useEffect } from 'react'
import { ArrowClockwiseIcon, CheckIcon, SpeakerHighIcon } from '@phosphor-icons/react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { useAudio } from '@/lib/audio/player'
import { PHRASES, phraseAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import type { Word } from '@/lib/words/types'

interface Props {
  /** The word to read out loud -- one they have answered well this session. */
  word: Word
  /** They say they read it. Recorded, and the session ends happily. */
  onSaid: () => void
  /** They would rather have another go. Nothing is recorded; it replays. */
  onAgain: () => void
}

/**
 * The one moment in this app that asks the child to *read*.
 *
 * Everything else trains sound to form: they hear a word and pick it
 * out. Reading is the other direction -- form to sound -- and it is what
 * the school is actually testing when a teacher says "read it to me".
 * The app's "known" was "picked it out of four, three times"; this is
 * the step that makes it mean something.
 *
 * The shape, and why:
 *
 *  - The word alone and large, with its heart marks, and **no audio for
 *    it**. The clip would answer the question. What is spoken is the
 *    instruction ("Say it out loud"), because a pre-reader cannot read
 *    an instruction either.
 *  - A big speaker, so they can check themselves afterwards. They are the
 *    judge, and checking is the point: production followed immediately
 *    by feedback is the strongest single learning event there is.
 *  - Two large controls, icon-only for a child who cannot read them: a
 *    tick for "I said that" and a circling arrow for "let me try
 *    again". **Both are successes.** Neither says wrong, neither scores,
 *    and the second one simply replays -- there is nothing here that can
 *    be failed.
 *
 * There is no microphone in this app, and there should never be one.
 * Nothing here listens; the child decides.
 */
export function SayIt({ word, onSaid, onAgain }: Props) {
  const { speak, enqueue } = useAudio()

  // The instruction, queued rather than spoken over the top: this
  // arrives in the same commit that the last round's "Well done!" is
  // still playing in. See `enqueue`.
  useEffect(() => enqueue([phraseAudioUrl('sayIt')]), [enqueue, word])

  return (
    <div
      data-testid="say-it"
      className="flex w-full flex-col items-center justify-center p-4
        gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]"
    >
      <p className="font-word text-[clamp(1.125rem,2.5vw,1.5rem)] font-semibold text-muted-foreground text-center leading-normal">
        {PHRASES.sayIt}
      </p>

      <div data-testid="say-it-word">
        <WordTile word={word} showTricky size="lg" />
      </div>

      {/*
        The check: they read it, then hears it. Not queued -- they asked
        for it, so it interrupts and they hear it at once.
      */}
      <ClayButton
        tone="play"
        ariaLabel="Hear the word"
        onPress={() => speak(wordAudioUrl(word.audioId))}
      >
        <SpeakerHighIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
      </ClayButton>

      <div className="flex flex-wrap justify-center gap-6">
        <ClayButton tone="primary" ariaLabel="I said that" onPress={onSaid}>
          <CheckIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
        </ClayButton>
        <ClayButton tone="primary" ariaLabel="Let me try again" onPress={onAgain}>
          <ArrowClockwiseIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
        </ClayButton>
      </div>
    </div>
  )
}
