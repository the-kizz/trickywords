'use client'
import { motion } from 'motion/react'
import { SpeakerHighIcon } from '@phosphor-icons/react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { PHRASES, type PhraseKey } from '@/lib/audio/manifest'
import { REVEAL_FADE_MS, type RevealPhase } from './useRoundAudio'
import { useReducedMotion } from '@/lib/useReducedMotion'
import type { Round } from '@/lib/engine/session'

interface Props {
  round: Round
  /** The game's own instruction, shown and spoken. */
  instruction: PhraseKey
  /** The child tapped the speaker -- `useRoundAudio`'s `hearWord`. */
  onHearWord: () => void
  /**
   * Whether the written word appears on the things the child taps.
   *
   * This is the question that decides whether the prompt below is
   * support or noise, and every game has to answer it -- which is why it
   * is required rather than defaulted, and why it is asked as a property
   * of the game's own screen rather than by listing game names here.
   *
   * True in both surviving round types, where the child's act is to
   * find or reproduce the written form: "here is the word -- now find
   * it, build it" is exactly errorless support. It is asked rather than
   * assumed because it is a property of a round's own screen, and a
   * round that showed the child nothing to compare the prompt against
   * -- the cut Memory Pairs, whose cards were all face down -- would
   * turn support into a reading-off exercise with an extra step.
   */
  targetsShowWords: boolean
  /**
   * Where the round is in the reveal -- `useRoundAudio`'s
   * `revealPhase`. The word is drawn while it is `showing`, fades on
   * `fading`, and is gone once the round is `asking`.
   *
   * The hook owns the timing because it owns the clips whose lengths
   * decide it, and because the same flag has to gate the game's own
   * tappables: the word and the choices must never be on screen
   * together. A game that does not pass it never reveals, which is
   * right for a game with nothing to compare a written word against.
   */
  revealPhase?: RevealPhase
}

/**
 * The three things every round opens with: what to do, a way to hear
 * the word again, and -- while support is high -- the heart-marked word
 * itself in writing.
 *
 * The last of those is why this exists. `support.showWordBeforeRound`
 * is true at box 0 and for any struggling word, and it used to be
 * honoured in one game of seven: the rest showed a brand-new or
 * repeatedly-missed word no written prompt at all, so "errorless early
 * support" was a claim the app only kept some of the time. It now holds
 * in both round types, from one place. `targetsShowWords` is where a
 * round says whether its prompt has anything on screen to be read
 * against.
 */
export function RoundHeader({
  round, instruction, onHearWord, targetsShowWords, revealPhase = 'asking',
}: Props) {
  const reduced = useReducedMotion()
  return (
    <>
      <p className="font-word text-[clamp(1.125rem,2.5vw,1.5rem)] font-semibold text-muted-foreground text-center leading-normal">
        {PHRASES[instruction]}
      </p>

      <ClayButton tone="play" ariaLabel="Hear the word again" onPress={onHearWord}>
        <SpeakerHighIcon aria-hidden="true" weight="bold" className="w-10 h-10" />
      </ClayButton>

      {/*
        The word, while it is being said and for a beat after. It fades
        rather than vanishing, so a child watching it sees it leave --
        and cuts instead, with no fade at all, when the system asks for
        reduced motion.
      */}
      {round.support.showWordBeforeRound && targetsShowWords && revealPhase !== 'asking' && (
        <motion.div
          data-testid="prompt-word"
          initial={{ opacity: 1 }}
          animate={{ opacity: revealPhase === 'fading' ? 0 : 1 }}
          transition={{ duration: reduced ? 0 : REVEAL_FADE_MS / 1000 }}
        >
          <WordTile word={round.word} showTricky size="lg" />
        </motion.div>
      )}
    </>
  )
}
