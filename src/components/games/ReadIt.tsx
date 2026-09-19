'use client'
import { useEffect, useRef, useState } from 'react'
import { ArrowClockwiseIcon, CheckIcon, SpeakerHighIcon } from '@phosphor-icons/react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { useAudio, clipDurationMs as celebrationMs, GAP_MS } from '@/lib/audio/player'
import { PHRASES, phraseAudioUrl, sentenceAudioUrl, wordAudioUrl } from '@/lib/audio/manifest'
import { ADULT_TARGET_PX } from '@/lib/constants'
import { useGrownUp } from './GrownUpContext'
import type { GameProps } from './types'

/**
 * A grown-up's control, not a child's.
 *
 * Deliberately not `ClayButton`: that is built for a five-year-old's
 * finger and a child's eye, and these are read and pressed by an adult
 * looking over their shoulder. Adult-sized (`ADULT_TARGET_PX`) and worded
 * rather than iconic, and never the primary fill every answer button the
 * child has tapped all session wears -- an adult-sized blue button in the
 * child's own colour is a button a five-year-old presses. Both of these
 * are outlined on the card surface instead; the emphasis between them is
 * the border, not the fill.
 */
function AdultButton(
  { label, ariaLabel, primary, onPress }: {
    label: string
    /** The full sentence, where the visible label is shortened to fit. */
    ariaLabel?: string
    primary?: boolean
    onPress: () => void
  },
) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      style={{ minHeight: ADULT_TARGET_PX }}
      className={`rounded-clay border-2 px-5 font-semibold cursor-pointer select-none
        focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun
        ${primary
          ? 'border-foreground bg-card text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  )
}

/**
 * The word alone, no sound, and they read it.
 *
 * Every other round in this app runs sound to form: they hear a word and
 * picks it out of a few. This one runs the other way, and it is the only
 * one that matches what their school actually measures. InitiaLit's
 * progress monitoring is a list of tricky words read aloud from print,
 * unaided -- "4. Reading tricky words: he, she, we, are, said... /13" --
 * and its lesson routine is the same act: hold the card up, "What
 * word?", signal, then use it in a sentence. The app's "known" used to
 * mean "picked it out of four, on five days", which is not that.
 *
 * **No audio of the word until it has been answered.** The clip would
 * answer the question. What is spoken is the instruction, because a
 * pre-reader cannot read an instruction either.
 *
 * Who judges depends on who is in the room, and it changes what the
 * round is worth:
 *
 *  - **On their own**, they judge. Two big icon-only controls, a tick for
 *    "I said that" and a circling arrow for "let me try again", and
 *    neither is a failure. A five-year-old's own account of whether they
 *    read a word is not evidence, so this is recorded (`saidIt`) and
 *    resolves as prompted -- the word is practised and never promoted.
 *  - **With a grown-up**, the grown-up judges, from adult-sized controls
 *    worded for an adult. That *is* evidence -- it is the school's own
 *    assessment, done at the kitchen table -- so "They read it" resolves
 *    unaided and promotes like any other round, and "Tell them" speaks
 *    the word and resolves prompted, exactly as a hint does elsewhere.
 *
 * Then the second half of the school's routine, which only happens with
 * an adult there because only an adult can hear the answer: ask them to
 * use it in a sentence. Nothing scores it and nothing can fail it -- its
 * value is oral language and knowing what the word means. The app's own
 * sentence plays afterwards as a model, which is InitiaLit's "define the
 * word for the children where necessary".
 *
 * The adult's prompts are written, not spoken: an adult can read, and a
 * clip for each would be a clip the child hears too. There is no
 * microphone in this app and there should never be one -- nothing here
 * listens, a person decides.
 */
type Phase = 'reading' | 'sentence'

export function ReadIt({ round, onAnswer, onMiss, onRead }: GameProps) {
  const { speak, enqueue } = useAudio()
  const timer = useRef<number | null>(null)
  const grownUp = useGrownUp()
  const [phase, setPhase] = useState<Phase>('reading')
  const [attempt, setAttempt] = useState(0)
  /** Whether they needed telling -- carried across the sentence step. */
  const [told, setTold] = useState(false)
  const word = round.word

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  // Queued rather than spoken over the top: this mounts in the same
  // commit that the last round's "Well done!" is still sounding in.
  // Keyed on the attempt so "let me try again" says it again.
  useEffect(
    () => enqueue([phraseAudioUrl('sayIt')]),
    [enqueue, word, attempt],
  )

  /**
   * Ends the round. `prompted` false only when they read it unaided.
   *
   * Praised like every other round -- this was the one round that ended
   * in silence, and it is the hardest one in the app. Held open for as
   * long as the praise and any model sentence sound, for the same reason
   * every other round is: the audio was already queued in the right
   * order, but the next word appeared over the top of it.
   */
  function finish(prompted: boolean, after = 0) {
    const ms = celebrationMs(phraseAudioUrl('wellDone'))
    enqueue([phraseAudioUrl('wellDone')])
    timer.current = window.setTimeout(() => onAnswer(true, prompted), after + ms)
  }

  function childSaidIt() {
    onRead?.('child')
    // Their own word for it, so it practises the word and never promotes
    // it -- the same contract as an answer given after a hint.
    finish(true)
  }

  function adultConfirmed(readItAlone: boolean) {
    if (readItAlone) {
      onRead?.('adult')
    } else {
      speak(wordAudioUrl(word.audioId))
      // Needing to be told is a miss, and it has to be recorded as one.
      // Resolving it as merely "prompted" meant the adult path could only
      // ever push a word up: a word failed to an adult on five evenings
      // running still read "Known solidly" in the parent area, and
      // `struggling` -- the whole mechanism for dropping a word back to
      // errorless support -- was unreachable by failing to read. A
      // mis-tap among four tiles cost a box while failing to read the
      // word from print cost nothing, which is backwards.
      //
      // Nothing the child sees changes, exactly as everywhere else: no
      // "wrong", no score, and the round still resolves as a success.
      onMiss()
    }
    setTold(!readItAlone)
    setPhase('sentence')
  }

  function afterSentence(heard: boolean) {
    // The app's sentence as the model, queued so it follows rather than
    // cutting off the word an adult may have just played -- and the round
    // waits it out, or the next word lands while it is still speaking.
    if (!heard) { finish(told); return }
    const sentence = sentenceAudioUrl(word.audioId)
    enqueue([sentence])
    finish(told, celebrationMs(sentence) + GAP_MS)
  }

  if (phase === 'sentence') {
    return (
      <div
        data-testid="read-it-sentence"
        className="flex w-full flex-col items-center justify-center p-4
          gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]"
      >
        <div data-testid="read-it-word">
          <WordTile word={word} showTricky size="lg" />
        </div>

        <p className="max-w-md text-center text-[clamp(1rem,2vw,1.125rem)] text-muted-foreground leading-normal">
          Ask them: <strong className="text-foreground">can you use it in a sentence?</strong>
          <br />
          Anything they say counts. Nothing here is marked.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <AdultButton
            label="They did"
            ariaLabel="They said a sentence"
            primary
            onPress={() => afterSentence(true)}
          />
          <AdultButton label="Skip" ariaLabel="Skip the sentence" onPress={() => afterSentence(false)} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="read-it"
      className="flex w-full flex-col items-center justify-center p-4
        gap-[clamp(0.75rem,2.5vh,1.5rem)] min-h-[60vh]"
    >
      <p className="font-word text-[clamp(1.125rem,2.5vw,1.5rem)] font-semibold text-muted-foreground text-center leading-normal">
        {PHRASES.sayIt}
      </p>

      <div data-testid="read-it-word">
        <WordTile word={word} showTricky size="lg" />
      </div>

      {grownUp ? (
        <div data-testid="read-it-adult" className="flex flex-col items-center gap-4">
          <p className="max-w-md text-center text-[clamp(1rem,2vw,1.125rem)] text-muted-foreground leading-normal">
            Did they read it on their own?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <AdultButton label="They read it" primary onPress={() => adultConfirmed(true)} />
            <AdultButton label="Tell them" ariaLabel="Tell them the word" onPress={() => adultConfirmed(false)} />
          </div>
        </div>
      ) : (
        <>
          {/*
            The check, and only theirs: they read it, then hears it. Not
            queued -- they asked for it, so they hear it at once.
          */}
          <ClayButton
            tone="play"
            ariaLabel="Hear the word"
            onPress={() => speak(wordAudioUrl(word.audioId))}
          >
            <SpeakerHighIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
          </ClayButton>

          <div className="flex flex-wrap justify-center gap-6">
            <ClayButton tone="primary" ariaLabel="I said that" onPress={childSaidIt}>
              <CheckIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
            </ClayButton>
            <ClayButton
              tone="primary"
              ariaLabel="Let me try again"
              onPress={() => setAttempt((n) => n + 1)}
            >
              <ArrowClockwiseIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
            </ClayButton>
          </div>
        </>
      )}
    </div>
  )
}
