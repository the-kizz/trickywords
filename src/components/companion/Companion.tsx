'use client'
import { useEffect, useState } from 'react'
import type { CompanionStage } from '@/lib/rewards'

interface Props {
  stage: CompanionStage
}

/**
 * The five delivered growth stages, in order. `CompanionStage` is
 * `0..4`; the artwork is numbered from one, so the index maps straight
 * across and the thresholds in `@/lib/rewards` never have to move.
 *
 * These are the supplied pre-composited neutral pose -- the persistent
 * companion needs no layer compositing, so it does not do any.
 */
const STAGE_ART: readonly string[] = [
  '/companion/companion-stage-1.webp',
  '/companion/companion-stage-2.webp',
  '/companion/companion-stage-3.webp',
  '/companion/companion-stage-4.webp',
  '/companion/companion-stage-5.webp',
]

/**
 * What each stage actually shows, as a phrase that can follow either
 * "Your friend," or "Your friend is cheering,".
 *
 * These describe the delivered artwork and nothing else. What grows is a
 * plant on the companion's head -- a sprout, then leaves, then a bud,
 * then a flower -- and a label is no use to a child or a parent who
 * cannot see the screen unless it says so.
 */
export const STAGE_DETAIL: Record<CompanionStage, string> = {
  0: 'just starting out',
  1: 'with a small sprout growing on top',
  2: 'with a taller sprout and four leaves',
  3: 'with a leafy stem and a flower bud about to open',
  4: 'with an amber flower in full bloom',
}

const LABELS: Record<CompanionStage, string> = {
  0: `Your friend, ${STAGE_DETAIL[0]}`,
  1: `Your friend, ${STAGE_DETAIL[1]}`,
  2: `Your friend, ${STAGE_DETAIL[2]}`,
  3: `Your friend, ${STAGE_DETAIL[3]}`,
  4: `Your friend, ${STAGE_DETAIL[4]}`,
}

/**
 * The size of the square box the companion is drawn in.
 *
 * All nine companion images share one 1024-square canvas: the same
 * scale, the feet on the same line at 96% of it, and one body width for
 * stage 1 and every pose. The supplier's rule is therefore simply to
 * render the **whole canvas** at a fixed size with `object-fit:
 * contain`, and never to crop or trim to the visible pixels. Cropping is
 * what would break the feature: the body grows ~2.5% per stage while the
 * plant climbs far higher, so fitting the visible content would scale
 * each later stage down and the body would appear to *shrink* as the
 * child learned more words.
 */
export const COMPANION_BOX_PX = 160

/**
 * Reads `prefers-reduced-motion`, the same way `ProgressMap` and the
 * games do, so the growth animation is dropped entirely rather than
 * merely shortened for a child who asked for less movement.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/**
 * The companion: one commissioned illustration per growth stage, served
 * from `public/companion/`. It only ever gains the next stage's plant;
 * nothing it shows is ever taken away, so it stays a record of progress
 * a child can look back on and feel good about.
 */
export function Companion({ stage }: Props) {
  const reducedMotion = useReducedMotion()

  return (
    <img
      /*
        `key={stage}` remounts on growth so the settle plays again at the
        moment it means something, and never on an unrelated re-render.
      */
      key={stage}
      src={STAGE_ART[stage]}
      // The accessible name is the stage label, so the empty `alt` is
      // only there to satisfy the linter and older stacks; the explicit
      // `role="img"` keeps this an image, not decoration.
      alt=""
      role="img"
      aria-label={LABELS[stage]}
      width={COMPANION_BOX_PX}
      height={COMPANION_BOX_PX}
      style={{ objectFit: 'contain' }}
      className={`block mx-auto ${reducedMotion ? '' : 'companion-grow'}`}
    />
  )
}
