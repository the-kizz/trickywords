import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The worst thing the gameplay review found: one wrong tap on a word at
 * the top of the ladder demoted it, the demoted word left `known`, and
 * because the companion was a pure function of the live known count, it
 * shrank a stage. They lost something they had earned by mis-tapping once.
 *
 * It is now drawn from a stored high-water mark, so the arithmetic
 * below -- five words earned, one of them since slipped -- leaves the
 * friend on the map exactly where they were.
 */

const SETS = DEFAULT_SETS
const ALL = SETS.flatMap((s) => s.words)

function known(wordId: string): WordProgress {
  let p = newProgress(wordId)
  for (let i = 0; i < 5; i++) p = recordCorrect(p, false)
  return p
}

/** `count` words at the top of the ladder, the rest never met. */
function progressWithKnown(count: number): Record<string, WordProgress> {
  return Object.fromEntries(
    ALL.slice(0, count).map((w) => [w.id, known(w.id)]),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ wordIds: [] }),
  }))
})

/** The growth stage the companion on the map is actually drawing. */
function companionStageArt() {
  return document.querySelector<HTMLImageElement>('img[src^="/companion/"]')?.getAttribute('src')
}

describe('a child never loses what they have earned', () => {
  it('keeps the companion when a known word slips back', () => {
    render(
      <FamilyPlay
        profileId={1}
        profileName="Robin"
        profileAvatar="avatar-fox"
        sets={SETS}
        // Five words were known when the companion last grew; one has
        // since slipped a box after a wrong tap, so four are known now.
        initialProgress={progressWithKnown(4)}
        bestKnown={5}
      />,
    )
    // Stage 1 of five, the one five known words buys -- not stage 0.
    expect(companionStageArt()).toBe('/companion/companion-stage-2.webp')
  })

  it('draws the companion from the live count when there is no mark yet', () => {
    render(
      <FamilyPlay
        profileId={1}
        profileName="Robin"
        profileAvatar="avatar-fox"
        sets={SETS}
        initialProgress={progressWithKnown(5)}
      />,
    )
    expect(companionStageArt()).toBe('/companion/companion-stage-2.webp')
  })

  /** One thing that grows, and it is the companion. */
  it('shows no sticker book anywhere on the map', () => {
    render(
      <FamilyPlay
        profileId={1}
        profileName="Robin"
        profileAvatar="avatar-fox"
        sets={SETS}
        initialProgress={progressWithKnown(20)}
        bestKnown={20}
      />,
    )
    expect(screen.queryAllByTestId(/^sticker-slot-/)).toHaveLength(0)
    expect(document.querySelector('img[src^="/stickers/"]')).toBeNull()
  })
})
