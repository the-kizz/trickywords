'use client'
import type { CompanionStage } from '@/lib/rewards'
import {
  COMPANION_BOX_PX, STAGE_DETAIL, useReducedMotion,
} from '@/components/companion/Companion'

/**
 * The delivered poses. Only `cheering` is drawn anywhere today (the
 * session-complete celebration); `thinking` and `waving` exist in the
 * artwork package and are deliberately not wired to any screen, so
 * their art is not committed either.
 */
export type CompanionPoseId = 'base' | 'cheering' | 'thinking' | 'waving'

type WiredPose = 'cheering'

const POSE_ART: Readonly<Record<WiredPose, string>> = {
  cheering: '/companion/companion-cheering.webp',
}

/**
 * The plant, as its own transparent layer, one per stage from 2 up.
 * Stage 1 has no plant at all, which is the point of stage 1.
 */
const PLANT_ART: Readonly<Record<2 | 3 | 4 | 5, string>> = {
  2: '/companion/plant-stage-2.webp',
  3: '/companion/plant-stage-3.webp',
  4: '/companion/plant-stage-4.webp',
  5: '/companion/plant-stage-5.webp',
}

/** The canvas every companion image shares, in source pixels. */
export const COMPANION_CANVAS_PX = 1024

/**
 * Where a plant layer has to move for each pose, in canvas pixels,
 * transcribed from the artwork package's `companion-plant/anchors.json`
 * (`offset_for_plant`). The layers are drawn aligned to the `base`
 * pose's head, so `base` needs no shift; a pose that raises or turns the
 * head moves the plant with it, and the cheering pose's raised arms lift
 * the head by 110px.
 */
export const PLANT_OFFSETS: Readonly<Record<CompanionPoseId, { dx: number; dy: number }>> = {
  base: { dx: 0, dy: 0 },
  cheering: { dx: -18, dy: -110 },
  thinking: { dx: -51, dy: -10 },
  waving: { dx: 1, dy: -58 },
}

/**
 * The plant layer for a stage, or null when the stage has no plant.
 *
 * `CompanionStage` is `0..4` and the artwork is numbered `1..5`, so
 * stage 0 is the bare companion and stages 1-4 map to plant layers 2-5.
 */
export function plantLayerFor(stage: CompanionStage): string | null {
  if (stage === 0) return null
  return PLANT_ART[(stage + 1) as 2 | 3 | 4 | 5]
}

/**
 * The transform that puts a pose's plant layer on that pose's head.
 *
 * Expressed as a percentage of the image's own box rather than in
 * pixels, because both layers are the full 1024 canvas drawn `contain`
 * inside the same square box: the offset then scales with whatever box
 * size the caller chose, with nothing to measure at runtime and nothing
 * to recompute on resize.
 */
export function plantTransform(pose: CompanionPoseId): string {
  const { dx, dy } = PLANT_OFFSETS[pose]
  const pct = (v: number) => `${((v / COMPANION_CANVAS_PX) * 100).toFixed(4)}%`
  return `translate(${pct(dx)}, ${pct(dy)})`
}

/**
 * The composite is one picture, so it gets one name -- and that one name
 * has to carry both halves of what a sighted child sees: the companion
 * is cheering, *and* it is their own companion, at the stage they have
 * grown it to. So the pose's verb opens the label and the stage's own
 * description finishes it, reusing the very same phrases the persistent
 * companion uses rather than keeping a second wording in step by hand.
 */
export function poseLabel(pose: WiredPose, stage: CompanionStage): string {
  const VERB: Record<WiredPose, string> = { cheering: 'is cheering' }
  return `Your friend ${VERB[pose]}, ${STAGE_DETAIL[stage]}`
}

interface Props {
  pose: WiredPose
  stage: CompanionStage
  size?: number
}

/**
 * The companion in a pose, at the child's own growth stage.
 *
 * Four poses and four plant layers give all twenty combinations from
 * eight images, so the celebration can show *this* child's companion
 * cheering rather than a generic one -- the companion they have grown,
 * doing the celebrating.
 *
 * Accessibility: the whole thing is one picture, so the pose image
 * carries the stage's label and the plant layer is `aria-hidden`. A
 * screen reader hears one companion, not two images.
 */
export function CompanionPose({ pose, stage, size = COMPANION_BOX_PX }: Props) {
  const reducedMotion = useReducedMotion()
  const plant = plantLayerFor(stage)
  const art = POSE_ART[pose]

  return (
    <div
      className={`relative block mx-auto ${reducedMotion ? '' : 'companion-grow'}`}
      style={{ width: size, height: size }}
      data-testid={`companion-pose-${pose}`}
    >
      <img
        src={art}
        alt=""
        role="img"
        aria-label={poseLabel(pose, stage)}
        width={size}
        height={size}
        style={{ objectFit: 'contain', position: 'absolute', inset: 0 }}
      />
      {plant !== null && (
        <img
          src={plant}
          alt=""
          aria-hidden="true"
          data-testid="companion-plant-layer"
          width={size}
          height={size}
          style={{
            objectFit: 'contain',
            position: 'absolute',
            inset: 0,
            transform: plantTransform(pose),
          }}
        />
      )}
    </div>
  )
}
