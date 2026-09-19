import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Companion } from '@/components/companion/Companion'
import { STAGE_DETAIL } from '@/components/companion/Companion'
import {
  CompanionPose, PLANT_OFFSETS, plantLayerFor, plantTransform, poseLabel,
  COMPANION_CANVAS_PX, type CompanionPoseId,
} from '@/components/companion/CompanionPose'

describe('Companion', () => {
  it('is announced to screen readers as a labelled image', () => {
    render(<Companion stage={0} />)
    expect(screen.getByRole('img')).toHaveAccessibleName()
  })

  /*
   * The labels have to describe the artwork that exists. What grows is a
   * plant on the companion's head, so no label may mention the old
   * hand-drawn creature's tuft, arms, tail or crown of leaves -- a
   * screen-reader user told about limbs that are not on screen is worse
   * off than one given a plain description.
   */
  it('describes the plant it actually grows, at every stage', () => {
    const labels = ([0, 1, 2, 3, 4] as const).map((stage) => {
      const { unmount } = render(<Companion stage={stage} />)
      const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
      unmount()
      return label
    })

    expect(labels).toEqual([
      'Your friend, just starting out',
      'Your friend, with a small sprout growing on top',
      'Your friend, with a taller sprout and four leaves',
      'Your friend, with a leafy stem and a flower bud about to open',
      'Your friend, with an amber flower in full bloom',
    ])

    for (const label of labels) {
      expect(label).not.toMatch(/tuft|arms|tail|crown/i)
    }
    // Every stage is described differently, or the label would tell a
    // child nothing about having grown.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('renders every growth stage without crashing', () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const { unmount } = render(<Companion stage={stage} />)
      expect(screen.getByRole('img')).toBeInTheDocument()
      unmount()
    }
  })

  /*
   * Replaces the old "shows more detail as it grows" test, which counted
   * SVG child elements. The companion is no longer drawn in SVG, so that
   * count is gone; what the stages have instead is one committed local
   * image each, which is what this asserts.
   */
  it('shows a different committed local image at each stage, never a network URL', () => {
    const srcs = ([0, 1, 2, 3, 4] as const).map((stage) => {
      const { unmount } = render(<Companion stage={stage} />)
      const src = screen.getByRole('img').getAttribute('src')
      unmount()
      return src
    })
    expect(srcs).toEqual([
      '/companion/companion-stage-1.webp',
      '/companion/companion-stage-2.webp',
      '/companion/companion-stage-3.webp',
      '/companion/companion-stage-4.webp',
      '/companion/companion-stage-5.webp',
    ])
  })

  /*
   * All nine companion images share one 1024 canvas at one scale with
   * the feet on one line, so the rule is to draw the whole canvas
   * `contain` at a fixed size. Cropping to the visible pixels instead
   * would scale each later stage down to fit its taller plant, and the
   * body would appear to shrink as the child learned more words.
   */
  it('draws the full canvas at a fixed size, never cropped to the content', () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const { unmount } = render(<Companion stage={stage} />)
      const img = screen.getByRole('img') as HTMLImageElement
      expect(img.style.objectFit).toBe('contain')
      expect(img.getAttribute('width')).toBe('160')
      expect(img.getAttribute('height')).toBe('160')
      unmount()
    }
  })
})

describe('CompanionPose — a pose at the child\'s own stage', () => {
  it('shows the cheering pose with the plant layer for the stage', () => {
    for (const [stage, plant] of [
      [1, '/companion/plant-stage-2.webp'],
      [2, '/companion/plant-stage-3.webp'],
      [3, '/companion/plant-stage-4.webp'],
      [4, '/companion/plant-stage-5.webp'],
    ] as const) {
      const { unmount } = render(<CompanionPose pose="cheering" stage={stage} />)
      expect(screen.getByRole('img').getAttribute('src'))
        .toBe('/companion/companion-cheering.webp')
      expect(screen.getByTestId('companion-plant-layer').getAttribute('src')).toBe(plant)
      unmount()
    }
  })

  it('renders no plant layer at stage 1, which has no plant', () => {
    render(<CompanionPose pose="cheering" stage={0} />)
    expect(plantLayerFor(0)).toBeNull()
    expect(screen.queryByTestId('companion-plant-layer')).toBeNull()
    expect(screen.getByRole('img').getAttribute('src'))
      .toBe('/companion/companion-cheering.webp')
  })

  it('is one picture with one accessible name, not two images announcing separately', () => {
    render(<CompanionPose pose="cheering" stage={4} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAccessibleName()
    expect(screen.getByTestId('companion-plant-layer').getAttribute('aria-hidden')).toBe('true')
  })

  /*
   * That one name has to carry both halves of the picture: the pose and
   * the stage. It reuses the persistent companion's own stage phrases,
   * so the two can never drift apart.
   */
  it('names the pose and the stage together, in one label', () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const { unmount } = render(<CompanionPose pose="cheering" stage={stage} />)
      const label = screen.getByRole('img').getAttribute('aria-label')
      expect(label).toBe(poseLabel('cheering', stage))
      expect(label).toBe(`Your friend is cheering, ${STAGE_DETAIL[stage]}`)
      expect(label).toMatch(/^Your friend is cheering, /)
      expect(label).not.toMatch(/tuft|arms|tail|crown/i)
      unmount()
    }

    expect(poseLabel('cheering', 0)).toBe('Your friend is cheering, just starting out')
    expect(poseLabel('cheering', 4))
      .toBe('Your friend is cheering, with an amber flower in full bloom')
  })

  /*
   * The offsets come from the artwork package's own anchors.json. They
   * are applied per pose, as a share of the rendered box rather than in
   * raw canvas pixels, so the plant lands on the head at any box size.
   */
  it('applies each pose its own offset, scaled to the rendered box', () => {
    expect(PLANT_OFFSETS).toEqual({
      base: { dx: 0, dy: 0 },
      cheering: { dx: -18, dy: -110 },
      thinking: { dx: -51, dy: -10 },
      waving: { dx: 1, dy: -58 },
    })

    for (const pose of Object.keys(PLANT_OFFSETS) as CompanionPoseId[]) {
      const { dx, dy } = PLANT_OFFSETS[pose]
      const asPercent = (v: number) => ((v / COMPANION_CANVAS_PX) * 100).toFixed(4)
      expect(plantTransform(pose))
        .toBe(`translate(${asPercent(dx)}%, ${asPercent(dy)}%)`)
    }

    expect(plantTransform('base')).toBe('translate(0.0000%, 0.0000%)')
    expect(plantTransform('cheering')).not.toBe(plantTransform('thinking'))
  })

  it('puts the cheering pose\'s offset on the plant layer it actually renders', () => {
    render(<CompanionPose pose="cheering" stage={4} size={320} />)
    const plant = screen.getByTestId('companion-plant-layer') as HTMLImageElement
    // -18/1024 and -110/1024 of the box, so at a 320px box the plant
    // sits 5.625px left and 34.375px up -- the same placement at any size.
    expect(plant.style.transform).toBe(plantTransform('cheering'))
    expect(plant.style.transform).toBe('translate(-1.7578%, -10.7422%)')
    expect(plant.getAttribute('width')).toBe('320')
  })
})
