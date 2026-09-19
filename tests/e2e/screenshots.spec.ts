import { test, expect, type Page } from '@playwright/test'
import {
  detectRoundType, sessionFinished, solveCurrentRound, targetWord,
} from './game-helpers'
import { publicURL } from './ports'

/**
 * Generates the README screenshots from the seeded demo profiles
 * (Robin, Sam -- see `scripts/seed-demo.ts`), against the one server
 * the rest of the E2E suite runs: the family surface on FAMILY_PORT and
 * the guest surface on PUBLIC_PORT (see `tests/e2e/ports.ts`).
 *
 * Every screenshot uses demo data only -- `afterEach` below asserts
 * the real username of whoever runs this suite, and a bare "@" (email
 * shape), never leak into a captured page.
 */
const PIN = '1234'
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

test.describe.configure({ mode: 'serial' })

/**
 * Captures a screenshot with the `next dev` overlay badge hidden. The
 * E2E servers are dev servers (see `playwright.config.ts`), so Next
 * renders its dev-tools indicator into a `<nextjs-portal>` in the
 * bottom-left corner -- tooling chrome that is not part of the product
 * and must not appear in README images. Hidden here rather than via
 * `devIndicators` in `next.config.ts` so real local development keeps
 * the badge.
 */
async function shot(page: Page, name: string): Promise<void> {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' })
  await page.screenshot({ path: `docs/screenshots/${name}` })
}

test.afterEach(async ({ page }) => {
  // Visible text only, not the raw served HTML -- Tailwind's generated
  // <style> block legitimately contains "@media"/"@font-face", which
  // would otherwise false-positive a bare "@" check.
  const text = await page.evaluate(() => document.body.innerText)
  const username = process.env.USER
  if (username) expect(text).not.toContain(username)
  expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/) // email shape
})

async function robinHref(page: Page): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const href = await page.getByRole('link', { name: 'Robin', exact: true }).getAttribute('href')
  if (!href) throw new Error('No profile link found for Robin')
  return href
}

/**
 * Advances a live heart-word-builder round until the screen shows a
 * heart on an irregular grapheme with at least three letters built and
 * the word still unfinished, then returns true.
 *
 * Both halves of that condition are needed for the image to read
 * correctly. The heart must already be placed, obviously. But it must
 * also sit in a word long enough to still look unfinished: `were`
 * (`w`/`e`/`re`) built as far as its heart reads "we" -- a complete
 * word -- so the picture stops looking part-built at all. Waiting for
 * three built letters skips that case and lands on words like `want`
 * (`w`/`a`/`n`/`t`) at "wan", where the heart is plainly over the `a`
 * and a tile is plainly still to come.
 *
 * The round cannot have finished by then: every tap that ends it
 * unmounts the `tiles` container and returns false below.
 *
 * Returns false if this round ends without offering such a moment.
 */
async function buildHeartWordToPartialReveal(page: Page): Promise<boolean> {
  // Bail the moment this round's own container is gone -- if a previous
  // tap both placed the final grapheme and finished the round, the
  // whole heart-word-builder screen (and every locator scoped under
  // it, including `tiles`) is unmounted, and a fresh `.nth(i)` on it
  // would otherwise wait forever for an element that will never exist.
  const gone = async () => (await page.getByTestId('tiles').count()) === 0
  if (await gone()) return false

  // Built in grapheme order, worked out from the target word rather
  // than by trying tiles: an out-of-order tap is a recorded miss now,
  // and three of them drop the word into the struggling support level,
  // which would pull the very rounds this picture needs out of the
  // rotation. Same rule as `solveCurrentRound` -- longest available
  // tile that is a prefix of what is left of the word.
  let remaining = await targetWord(page)

  while (remaining.length > 0) {
    const tiles = page.getByTestId('tiles').getByRole('button')
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
    if (bestIndex === -1) return false

    // force: true -- ClayButton has a continuous idle animation, so
    // Playwright's actionability "stable" check never converges
    // otherwise (see the same pattern in game-helpers.ts).
    await tiles.nth(bestIndex).click({ force: true })
    await page.waitForTimeout(100)
    remaining = remaining.slice(bestLength)

    // That tap finished the word and the round -- nothing partial to
    // show; the caller moves on to the next round.
    if (await gone()) return false

    // Scoped to the built word: the shared round header now also shows
    // the heart-marked prompt word while support is high, and that
    // carries hearts of its own.
    const built = page.getByTestId('built')
    const hearts = await built.locator('[data-testid^="tricky-"]').count()
    const letters = (await built.innerText()).replace(/\s/g, '').length
    if (hearts > 0 && letters >= 3) return true
  }
  return false
}

test('01 family home -- the profile chooser', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Robin', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sam', exact: true })).toBeVisible()
  await shot(page, '01-profile-chooser.png')
})

test('02 progress map -- sets 1-2 complete', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  const href = await robinHref(page)
  await page.goto(href, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: /^Set 1,/ })).toBeVisible()
  await shot(page, '02-progress-map.png')
})

test('03 listen and find -- mid-round', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  const href = await robinHref(page)
  await page.goto(href, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Set 3,/ }).click()
  // Find it is the session's default round type, so it is usually the
  // first thing on screen; the loop plays past any Build the Word round
  // that comes first.
  for (let round = 0; round < 12; round++) {
    if ((await detectRoundType(page)) === 'find') break
    await solveCurrentRound(page, await detectRoundType(page))
    await page.waitForTimeout(150)
  }
  await expect(page.getByTestId('choices')).toBeVisible()
  expect(await detectRoundType(page)).toBe('find')
  await shot(page, '03-listen-and-find.png')

  await page.setViewportSize(PHONE)
  await shot(page, '03-mobile.png')
})

test('04 heart word builder -- a heart mid-build', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  // Set 10 is the set whose heart-word-builder rounds land on long
  // heart words -- `what` (`wh`/`a`/`t`), `want` (`w`/`a`/`n`/`t`),
  // `some` and `come` (`c`/`o`/`m`/`e`) -- each of which can be built
  // past its heart and still have a tile left to place. The shorter
  // early sets cannot: their heart words are two or three graphemes, so
  // the heart only ever appears on the tap that also finishes the word,
  // or on a prefix that reads as a whole word. See
  // `buildHeartWordToPartialReveal`.
  //
  // Driven through the guest surface rather than Robin's profile, so
  // the session holds Set 10 and nothing else. A family session is
  // "hybrid": it mixes in every word the child has already met, and by
  // the time this spec runs the earlier specs have had Robin meet most
  // of Sets 1-3 -- whose two-grapheme heart words crowd out the long
  // ones this picture needs. Guest progress lives in sessionStorage
  // and starts empty.
  //
  // Build the Word comes round for a heart word past box 0, at most
  // once per word per session (see `roundTypeFor`), so which long word
  // it lands on varies with how the session went. This replays Set 10
  // until one of them builds past its heart with a tile still to
  // place.
  let captured = false
  for (let attempt = 0; attempt < 8 && !captured; attempt++) {
    await page.goto('/play?set=10', { waitUntil: 'domcontentloaded' })
    const avatar = page.getByTestId(/^avatar-/).first()
    if ((await avatar.count()) > 0) await avatar.click()
    // `?set=N` auto-starts the session a tick after the avatar is in
    // place (and straight away on a later attempt, where the avatar is
    // already in sessionStorage), so wait for the round to be up rather
    // than asking what is on screen while the map still is.
    await expect(page.getByTestId('round-counter')).toBeVisible()

    for (let round = 0; round < 12 && !captured; round++) {
      if (await sessionFinished(page)) break
      const roundType = await detectRoundType(page)

      if (roundType === 'build') {
        if (await buildHeartWordToPartialReveal(page)) {
          await expect(page.locator('[data-testid^="tricky-"]').first()).toBeVisible()
          await shot(page, '04-heart-word-builder.png')
          captured = true
          break
        }
        // Either this round's heart landed on the final grapheme
        // (already finished by the helper above) or it ran out of
        // positions to try while still on the same round. Either way,
        // re-detect what's on screen now rather than assuming this
        // round is still active.
        if (await sessionFinished(page)) break
        if ((await page.getByTestId('tiles').count()) > 0) {
          await solveCurrentRound(page, 'build')
        }
        continue
      }

      await solveCurrentRound(page, roundType)
    }
  }
  expect(captured, 'expected at least one heart-word-builder round with a mid-build heart').toBe(true)
})

test('05 the companion on the map -- grown', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  const href = await robinHref(page)
  await page.goto(href, { waitUntil: 'domcontentloaded' })
  // The one reward there is. Robin already has Set 1 and most of Set 2
  // known, so their companion has grown past its first stage and sits on
  // the map without playing anything further. The sticker book that
  // used to be photographed here is gone: one thing that grows is
  // enough, and it is this one.
  const companion = page.locator('img[src^="/companion/"]').first()
  await expect(companion).toBeVisible()
  await companion.scrollIntoViewIfNeeded()
  await shot(page, '05-companion.png')
})

test('06 parent area -- per-word progress', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/parent', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/enter pin/i).fill(PIN)
  await page.getByRole('button', { name: /unlock/i }).click()
  await expect(page.getByRole('tablist', { name: /parent area sections/i })).toBeVisible()

  const robinSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Robin', exact: true }) })
  await robinSection.getByText('Set 10 --').click()
  await expect(robinSection).toContainText('keeps slipping')
  await robinSection.scrollIntoViewIfNeeded()
  await shot(page, '06-parent-area.png')
})

test('07 public guest home', async ({ page }) => {
  // This spec runs in the `family` project, so `baseURL` is the family
  // port. The guest surface is the *other* port of the same server, so
  // go there explicitly -- a relative URL here would silently
  // screenshot the family side.
  await page.setViewportSize(DESKTOP)
  await page.goto(`${publicURL}/play`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
  await shot(page, '07-public-guest.png')
})
