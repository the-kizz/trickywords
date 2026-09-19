import { expect, type Page } from '@playwright/test'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { RoundType } from '@/components/games'

/**
 * Words that must never appear anywhere in a session or a round -- the
 * app is built to have no losing condition and no failure feedback.
 */
export const FAILURE_WORDS = ['wrong', 'incorrect', 'failed', 'game over', 'you lose']

/** Score/tally language the celebration and round UI must never show. */
export const SCORE_WORDS = ['score', 'tally']

export async function assertNoFailureOrScoreLanguage(page: Page): Promise<void> {
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const bad of [...FAILURE_WORDS, ...SCORE_WORDS]) {
    expect(text, `page text unexpectedly contains "${bad}"`).not.toContain(bad)
  }
}

/**
 * One testid unique to each round type's own container, used to tell
 * them apart on screen: Find it puts its choice buttons in `choices`,
 * Build the Word its graphemes in `tiles`, and Where's the heart? the
 * word's own parts in `heart-parts`.
 */
export const ROUND_TESTID: Record<RoundType, string> = {
  find: 'choices',
  build: 'tiles',
  heart: 'heart-parts',
  read: 'read-it',
}

/**
 * Picks the first guest avatar and waits for the map to replace it.
 *
 * Retried, deliberately. `domcontentloaded` fires before React has
 * hydrated `/play`, so a click that lands in that window is received by
 * the DOM and handled by nobody -- the avatar takes focus and the screen
 * never changes. That raced rarely enough to go unnoticed for two waves
 * and then timed out a 120s test. Waiting for the button to be
 * *visible* does not close it (it is visible in the server HTML); the
 * only honest signal is the state change itself, so this clicks until
 * the map is up and fails loudly if it never is.
 */
export async function pickFirstAvatar(page: Page): Promise<void> {
  const avatar = page.getByTestId(/^avatar-/).first()
  await expect(avatar).toBeVisible()
  const map = page.getByRole('group', { name: 'Word set map' })
  for (let attempt = 0; attempt < 12; attempt++) {
    await avatar.click({ force: true })
    try {
      await map.waitFor({ timeout: 2_000 })
      return
    } catch {
      // Not hydrated yet -- tap it again.
    }
  }
  throw new Error('the avatar screen never gave way to the map')
}

/** Reads which round-scoped state the page is currently in, for detecting round advance. */
async function getMarker(page: Page): Promise<string> {
  if ((await page.getByTestId('celebration').count()) > 0) return 'celebration'
  const roundCounter = page.getByTestId('round-counter')
  if ((await roundCounter.count()) > 0) {
    return (await roundCounter.locator('.sr-only').innerText()).trim()
  }
  return 'unknown'
}

/**
 * The word the current round is asking for, from the invisible
 * `data-target-word` the runner renders (see `SessionRunner`). Lets a
 * spec answer correctly first time, which matters because a wrong tap
 * is a recorded miss: brute-forcing choices would bury every word in
 * lapses it never earned and flip it into the struggling support level.
 */
export async function targetWord(page: Page): Promise<string> {
  const value = await page.locator('[data-target-word]').first().getAttribute('data-target-word')
  if (value === null) throw new Error('No round on screen to read a target word from')
  return value.toLowerCase()
}

/**
 * Whether the session is over -- taking the say-it round's tick first if
 * that is what is on screen.
 *
 * A session ends on one word read out loud (see `SayIt`): the word
 * alone, a speaker to check themselves, and two controls that both count as
 * successes. A spec walking a session has to answer it like a child
 * would, and the tick is what ends the sitting.
 */
export async function sessionFinished(page: Page): Promise<boolean> {
  if ((await page.getByTestId('say-it').count()) > 0) {
    await page.getByRole('button', { name: 'I said that' }).click()
    await expect(page.getByTestId('celebration')).toBeVisible()
    return true
  }
  return (await page.getByTestId('celebration').count()) > 0
}

/** Which round type is currently on screen, by its container testid. */
export async function detectRoundType(page: Page): Promise<RoundType> {
  // A highly-supported round opens on the written word alone and the
  // round's own container arrives only once the word has been said and
  // has faded (see `useRoundAudio` rule 4), so there is a second or two
  // at the top of such a round with nothing on screen to detect.
  await page
    .locator(Object.values(ROUND_TESTID).map((t) => `[data-testid="${t}"]`).join(', '))
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {
      // Fall through to the error below, which names the real problem.
    })
  for (const [id, testid] of Object.entries(ROUND_TESTID) as Array<[RoundType, string]>) {
    if ((await page.getByTestId(testid).count()) > 0) return id
  }
  throw new Error('No known round container found on screen')
}

/**
 * Waits for a correct answer's closing moments to finish.
 *
 * Being right is no longer instant: from box 3 a chest opens on a star,
 * and from box 2 the word's sentence is shown and read aloud, before the
 * round resolves (`ChestReveal`, `SentenceMoment`). A spec that answered
 * and immediately looked for the next round would find itself in the
 * middle of one of them.
 */
export async function awaitRoundSettled(page: Page): Promise<void> {
  for (const testid of ['chest-reveal', 'sentence-moment']) {
    const moment = page.getByTestId(testid)
    if ((await moment.count()) > 0) {
      await moment.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {})
    }
  }
}

/**
 * Taps the one button whose accessible name is the target word -- how a
 * Find it round is answered.
 */
async function tapTargetWord(page: Page): Promise<void> {
  const target = await targetWord(page)
  const buttons = page.getByTestId(ROUND_TESTID.find).getByRole('button')
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const name = (await buttons.nth(i).getAttribute('aria-label')) ?? ''
    if (name.replace(/[^a-zA-Z']/g, '').toLowerCase() === target) {
      await buttons.nth(i).click({ force: true })
      await awaitRoundSettled(page)
      await page.waitForTimeout(150)
      return
    }
  }
  throw new Error(`No button named "${target}" among the choices`)
}

/**
 * Build the Word wants its tiles tapped in grapheme order, and an
 * out-of-order tap is a recorded miss, so this works out the order
 * instead of trying tiles. The target word is known; the tiles are its
 * graphemes plus decoys; so at each step the next grapheme is the
 * longest available tile that is a prefix of what is left of the word.
 * (Verified against all 56 default words: longest-prefix-first picks
 * the true grapheme every time.)
 */
async function solveHeartWordBuilder(page: Page): Promise<void> {
  const before = await getMarker(page)
  let remaining = await targetWord(page)

  while (remaining.length > 0) {
    if ((await getMarker(page)) !== before) return
    const tiles = page.getByTestId(ROUND_TESTID.build).getByRole('button')
    const count = await tiles.count()

    let bestIndex = -1
    let bestLength = 0
    for (let i = 0; i < count; i++) {
      const name = ((await tiles.nth(i).getAttribute('aria-label')) ?? '').toLowerCase()
      if (name.length > bestLength && remaining.startsWith(name)) {
        bestIndex = i
        bestLength = name.length
      }
    }
    if (bestIndex === -1) {
      throw new Error(`Build the Word: no tile starts "${remaining}"`)
    }

    await tiles.nth(bestIndex).click()
    await page.waitForTimeout(100)
    remaining = remaining.slice(bestLength)
  }

  await page.waitForTimeout(150)
}

/**
 * Where's the heart? wants the one grapheme that is marked tricky, and
 * the hearts are hidden until it is found -- which is the round -- so
 * there is nothing on screen to read the answer off. The tiles are the
 * word's own graphemes in order, so the answer is the tile at a tricky
 * index, read from the word list.
 */
async function solveWhereIsTheHeart(page: Page): Promise<void> {
  const target = await targetWord(page)
  const word = DEFAULT_SETS.flatMap((s) => s.words).find((w) => w.id === target)
  const index = word?.trickyIndices[0]
  if (index === undefined) {
    throw new Error(`Where's the heart?: no tricky part known for "${target}"`)
  }
  await page.getByTestId(ROUND_TESTID.heart).getByRole('button').nth(index).click()
  await page.waitForTimeout(150)
}

/** Plays whichever round is currently on screen to a correct answer. */
export async function solveCurrentRound(page: Page, type: RoundType): Promise<void> {
  if (type === 'build') return solveHeartWordBuilder(page)
  if (type === 'heart') return solveWhereIsTheHeart(page)
  return tapTargetWord(page)
}

/**
 * Plays an entire session round by round -- detecting, solving, and
 * re-checking no failure/score language appears at every step -- until
 * the celebration screen shows. Returns every round type actually
 * encountered, in order.
 */
export async function playSessionToCelebration(
  page: Page, opts: { maxRounds?: number } = {},
): Promise<RoundType[]> {
  const maxRounds = opts.maxRounds ?? 20
  const seen: RoundType[] = []
  for (let i = 0; i < maxRounds; i++) {
    await page.waitForTimeout(100)
    if (await sessionFinished(page)) break
    const type = await detectRoundType(page)
    seen.push(type)
    await assertNoFailureOrScoreLanguage(page)
    await solveCurrentRound(page, type)
    await assertNoFailureOrScoreLanguage(page)
  }
  await expect(page.getByTestId('celebration')).toBeVisible()
  await assertNoFailureOrScoreLanguage(page)
  return seen
}
