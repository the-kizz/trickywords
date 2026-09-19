'use client'
import { useEffect, useMemo } from 'react'
import { useAudio, clipDurationMs } from '@/lib/audio/player'
import { sentenceAudioUrl } from '@/lib/audio/manifest'
import type { Word } from '@/lib/words/types'

/**
 * The lowest box at which a correct answer is followed by the word's
 * sentence.
 *
 * Not at box 0 or 1: those rounds are a word's first meetings, they
 * already open with the word shown and spoken and taken away, and a
 * sentence on the end of them is a long wait for something a child has
 * no way to use yet. From box 2 the form is starting to stick, and
 * hearing it do its job in a real sentence is the thing that carries it
 * off the flashcard.
 */
export const SENTENCE_BOX = 2

/**
 * How long the sentence stays up after it has finished being read.
 * A beat to look at the lit word before the round moves on.
 */
export const SENTENCE_HOLD_MS = 600

/**
 * Slack ahead of the reading, because the clip is *queued* rather than
 * played at once: "Well done!" is still going when this arrives, and the
 * sentence must not leave the screen while it is still being read. The
 * same allowance the round's opening reveal makes, and for the same
 * reason -- see `REVEAL_LEAD_IN_MS`.
 */
export const SENTENCE_LEAD_IN_MS = 600

interface Props {
  /** The word just answered correctly. Its first sentence is the one read. */
  word: Word
  /** Called once the sentence has been read and held. */
  onDone: () => void
}

interface Token {
  key: string
  display: string
  isTarget: boolean
}

/**
 * The word's own example sentence, shown with the word lit and read out
 * loud, after a correct answer on a word that is starting to stick.
 *
 * **There is nothing to tap.** This is what Spot the Word was reaching
 * for and never delivered: it showed the sentence to a child who cannot
 * read it yet and then asked them to find the word in it, which measured
 * out as "tap the one with the big letter" -- 24 of 56 targets are the
 * capitalised first token. Read aloud, with the word lit, the sentence
 * stops being a test they cannot pass and becomes the one place in the
 * app where the word does its actual job.
 *
 * The reading is `sentenceAudioUrl(word.audioId)`, queued so it follows
 * the celebration rather than cutting it off, and the moment's length
 * comes from the generated clip table -- no clip length is named here.
 */
export function SentenceMoment({ word, onDone }: Props) {
  const { enqueue } = useAudio()
  const sentence = word.sentences[0]

  const tokens = useMemo<Token[]>(() => {
    const target = word.text.toLowerCase()
    return sentence
      .split(/\s+/)
      .filter(Boolean)
      .map((display, i) => ({
        key: `${i}-${display}`,
        display,
        isTarget: display.replace(/[^a-zA-Z']/g, '').toLowerCase() === target,
      }))
  }, [sentence, word])

  useEffect(() => {
    const url = sentenceAudioUrl(word.audioId)
    const cancel = enqueue([url])
    const done = window.setTimeout(
      onDone,
      SENTENCE_LEAD_IN_MS + clipDurationMs(url) + SENTENCE_HOLD_MS,
    )
    return () => {
      cancel()
      window.clearTimeout(done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word])

  return (
    <div
      data-testid="sentence-moment"
      role="status"
      className="font-word flex flex-wrap items-baseline justify-center gap-2
        max-w-2xl text-center text-[clamp(1.5rem,4vw,2.25rem)] font-semibold leading-relaxed"
    >
      {tokens.map((t) => (
        <span
          key={t.key}
          data-testid={t.isTarget ? 'sentence-target' : undefined}
          className={t.isTarget
            ? 'rounded-clay bg-play text-on-play px-2 font-bold'
            : undefined}
        >
          {t.display}
        </span>
      ))}
    </div>
  )
}
