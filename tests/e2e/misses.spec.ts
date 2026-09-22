import { test, expect, type Page } from '@playwright/test'
import { MIN_TARGET_PX } from '@/lib/constants'
import { GUEST_KEY } from '@/lib/guest/store'
import { STRUGGLE_LAPSE_THRESHOLD } from '@/lib/engine/strugglers'
import {
  assertNoFailureOrScoreLanguage, awaitRoundSettled, detectRoundType,
  pickFirstAvatar, ROUND_TESTID, solveCurrentRound, targetWord,
} from './game-helpers'
import type { WordProgress } from '@/lib/engine/types'

/**
 * The engine must learn that a child missed, and the child must never
 * find out that anything was recorded.
 *
 * Driven on the guest surface on purpose: its progress lives in
 * sessionStorage, so the miss can be read back out of the very record
 * the app keeps, with no server state to seed or clean up, and the
 * assertions cannot pass by accident off a stale database row.
 */

async function guestProgress(page: Page): Promise<Record<string, WordProgress>> {
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), GUEST_KEY)
  return raw ? (JSON.parse(raw).progress ?? {}) : {}
}

/** The round marker (`Round n of m`), for proving the round did not move. */
async function roundMarker(page: Page): Promise<string> {
  return (await page.getByTestId('round-counter').locator('.sr-only').innerText()).trim()
}

/**
 * Plays forward until a Find it round is on screen, so there is a button
 * that is visibly the wrong answer to tap.
 *
 * Build the Word has no such button: a decoy tap there is a child
 * working out which tiles are even in play, which is exploring rather
 * than misreading, and it is deliberately not reported as a miss (see
 * `HeartWordBuilder`).
 */
async function playUntilAFindRound(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const type = await detectRoundType(page)
    if (type === 'find') return
    await solveCurrentRound(page, type)
  }
  throw new Error('No Find it round came up in a full session')
}

test('a wrong tap is recorded, and shows the child nothing', async ({ page }) => {
  await page.goto('/play', { waitUntil: 'domcontentloaded' })
  await pickFirstAvatar(page)
  await page.getByRole('button', { name: /^Set 1,/ }).click()

  await playUntilAFindRound(page)
  const target = await targetWord(page)
  const markerBefore = await roundMarker(page)

  const choices = page.getByTestId(ROUND_TESTID.find).getByRole('button')

  // The one button that is visibly not the word that was called.
  let wrong = null
  for (let i = 0; i < (await choices.count()); i++) {
    const name = (await choices.nth(i).getAttribute('aria-label')) ?? ''
    if (name.replace(/[^a-zA-Z']/g, '').toLowerCase() !== target) {
      wrong = choices.nth(i)
      break
    }
  }
  expect(wrong, 'no wrong choice on screen').not.toBeNull()

  async function choiceNames(): Promise<string[]> {
    const names: string[] = []
    for (let i = 0; i < (await choices.count()); i++) {
      names.push((await choices.nth(i).getAttribute('aria-label')) ?? '')
    }
    return names
  }
  const namesBefore = await choiceNames()

  for (let n = 1; n <= STRUGGLE_LAPSE_THRESHOLD; n++) {
    await wrong!.click({ force: true })
    await page.waitForTimeout(250)

    // Nothing a child can see has changed: same round, same words on
    // screen, no failure or score language, every control still live
    // and still the size it was.
    expect(await roundMarker(page), 'the round advanced on a miss').toBe(markerBefore)
    await assertNoFailureOrScoreLanguage(page)
    // Nothing is marked, removed, renamed or reordered. The only thing
    // a miss may add anywhere is the gentle "Have another go" nudge
    // Listen and Find has always shown, which is an invitation, not a
    // correction -- `assertNoFailureOrScoreLanguage` above is what
    // holds that line.
    expect(await choiceNames()).toEqual(namesBefore)
    for (let i = 0; i < (await choices.count()); i++) {
      await expect(choices.nth(i)).toBeEnabled()
      const box = (await choices.nth(i).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
    }

    // And the engine has counted every one of them.
    const recorded = (await guestProgress(page))[target]
    console.log(
      `miss ${n}: ${target} lapses=${recorded.lapses} struggling=${recorded.struggling}` +
      ` marker="${await roundMarker(page)}"`,
    )
    expect(recorded.lapses).toBe(n)
  }

  // Three of them is the threshold: the word is now a struggler, which
  // was unreachable by a playing child before this channel existed.
  const afterThree = (await guestProgress(page))[target]
  expect(afterThree.struggling).toBe(true)

  // The round still resolves only on a correct answer.
  await solveCurrentRound(page, 'find')
  await awaitRoundSettled(page)
  // Polled, not a fixed pause: a correct answer now holds the round open
  // until "Well done!" has finished sounding (742ms at this voice), so
  // the next word never appears over the top of the praise. The 250ms
  // this used to wait was shorter than the clip.
  await expect.poll(() => roundMarker(page), { timeout: 15_000 })
    .not.toBe(markerBefore)
})
