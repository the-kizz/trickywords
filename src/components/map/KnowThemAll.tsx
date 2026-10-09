'use client'
import { useEffect } from 'react'
import { CompanionPose } from '@/components/companion/CompanionPose'
import { useAudio } from '@/lib/audio/player'
import { PHRASES, phraseAudioUrl } from '@/lib/audio/manifest'
import type { CompanionStage } from '@/lib/rewards'

interface Props {
  /** The companion's stage, from the stored high-water mark. */
  stage: CompanionStage
}

/**
 * The finish line: every island finished.
 *
 * There is one of these, and it is the only end the app has. The
 * sticker book used to sit here -- eleven pictures, the last of them
 * "you know them all" -- and it was a second reward system keyed off the
 * same count as the companion. A five-year-old needs one thing that
 * grows, and the companion is on the map every day where the stickers
 * were only ever seen at the end of a session.
 *
 * Spoken as well as written, like everything else a pre-reader meets;
 * the clip is the one the celebration already uses, so no new audio.
 * Sits above the map rather than replacing it -- the islands stay
 * tappable, because a child who knows them all may still want to play.
 */
export function KnowThemAll({ stage }: Props) {
  const { speak } = useAudio()

  useEffect(() => {
    speak(phraseAudioUrl('allDone'))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section
      data-testid="know-them-all"
      className="flex flex-col items-center gap-3 rounded-clay border-4 border-border
        bg-card px-6 py-5 max-w-xl"
    >
      <CompanionPose pose="cheering" stage={stage} />
      <p
        role="status"
        className="font-display text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-center"
      >
        You know them all!
      </p>
      <p className="text-[clamp(1.125rem,1.6vw,1.25rem)] text-muted-foreground text-center leading-normal">
        {PHRASES.allDone}
      </p>
    </section>
  )
}
