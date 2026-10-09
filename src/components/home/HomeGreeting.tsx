'use client'
import { useEffect } from 'react'
import { useAudio } from '@/lib/audio/player'
import { PHRASES, phraseAudioUrl } from '@/lib/audio/manifest'

/**
 * Speaks a short invitation the moment the home screen appears.
 *
 * A pre-reader gets nothing from silent text. `whosPlaying` is a
 * purpose-made phrase (see NOTICE / manifest.ts) rather than the old
 * reused `yourTurn` clip, so the spoken invitation matches what a child
 * is actually being asked here.
 */
export function HomeGreeting() {
  const { speak } = useAudio()

  useEffect(() => {
    speak(phraseAudioUrl('whosPlaying'))
    // Runs once, on arrival at the home screen only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <p className="text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold text-muted-foreground leading-normal" role="status">
      {PHRASES.whosPlaying}
    </p>
  )
}
