import { test, expect } from '@playwright/test'
import type { RoundType } from '@/components/games'
import { pickFirstAvatar, playSessionToCelebration } from './game-helpers'

/**
 * There were seven games and a chooser; there are three round types and
 * the session picks. This spec replaces the one that asserted *variety*
 * across a seven-game rotation -- a rotation that existed to hide the
 * fact that five of the seven were the same act.
 *
 * What a session must do now is simpler and truer: run, keep Find it as
 * the bulk of it, never offer a choice of game, and finish on a
 * celebration with nothing in it that reads as failure or score
 * (`playSessionToCelebration` checks that at every step).
 *
 * Which of the three a given word gets is a function of the word and the
 * calendar day (see `roundTypeFor`), so nothing here names a type it has
 * not earned the right to expect: the per-word rotation is measured in
 * `tests/unit/games/round-type.test.ts` and over a whole go in
 * `tests/unit/games/rotation.test.ts`, both of which can fix the day.
 */
function countBy(seen: RoundType[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const id of seen) counts[id] = (counts[id] ?? 0) + 1
  return counts
}

test.describe('rounds', () => {
  test('a fresh guest session is Find it rounds and finishes on a celebration', async ({ page }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await pickFirstAvatar(page)
    // Straight into the session: no chooser stands between the island
    // and the first round any more.
    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await expect(page.getByTestId('round-counter')).toBeVisible()

    const seen = await playSessionToCelebration(page)
    console.log(`fresh guest session: ${seen.length} rounds, dist=${JSON.stringify(countBy(seen))}`)
    expect(seen.length, 'expected at least one round').toBeGreaterThan(0)
    // Every word in a fresh set is at box 0, and a word being met for
    // the first time is always found, never built.
    expect(new Set(seen)).toEqual(new Set<RoundType>(['find']))
  })

  test("a child whose Set 1 is known plays it through and still finishes on a celebration", async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const href = await page.getByRole('link', { name: 'Robin', exact: true }).getAttribute('href')
    await page.goto(href!, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await expect(page.getByTestId('round-counter')).toBeVisible()

    const seen = await playSessionToCelebration(page)
    console.log(`Robin's known Set 1: ${seen.length} rounds, dist=${JSON.stringify(countBy(seen))}`)
    expect(seen.length).toBeGreaterThan(0)
    // Set 1's multi-grapheme heart words are past box 0, so the rotation
    // may give any of them a Build or a Where's-the-heart today -- which,
    // and on which day, is not this spec's business. What must hold is
    // that Find it is still the bulk of the go.
    const varied = seen.filter((type) => type !== 'find').length
    expect(varied).toBeLessThanOrEqual(Math.ceil(seen.length / 2))
  })

  test('there is no game chooser anywhere between the island and the round', async ({ page }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await pickFirstAvatar(page)
    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await expect(page.getByTestId('round-counter')).toBeVisible()
    await expect(page.getByTestId('game-chooser')).toHaveCount(0)
    await expect(page.getByTestId('choose-surprise')).toHaveCount(0)
  })
})
