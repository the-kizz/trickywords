import { test, expect, type Page } from '@playwright/test'
import {
  detectRoundType, roundOnScreen, sessionFinished, solveCurrentRound, targetWord,
} from './game-helpers'
import { publicURL } from './ports'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

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

    // What makes this a picture worth taking: enough of the word placed
    // to read as part-built, with tiles still to go.
    //
    // This used to require a heart on the built word as well, which is
    // why gating the *assertion* on `HEART_MARKS_ENABLED` was not
    // enough -- with the marks off, `hearts` is always 0, so the
    // condition could never be met and the replay loop ran until the
    // test timed out. Scoped to the built word either way: the round
    // header also shows the prompt word while support is high, and that
    // carries marks of its own when they are on.
    const built = page.getByTestId('built')
    const letters = (await built.innerText()).replace(/\s/g, '').length
    if (letters < 3) continue
    if (!HEART_MARKS_ENABLED) return true
    const hearts = await built.locator('[data-testid^="tricky-"]').count()
    if (hearts > 0) return true
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

/**
 * KNOWN BROKEN, and skipped rather than deleted -- `test.fixme`, so it
 * reports as work outstanding instead of quietly passing.
 *
 * Three things are wrong with it, and they compound:
 *
 *  1. It asserted a heart was visible on the built word. The marks are
 *     off (`HEART_MARKS_ENABLED`), so that could not pass -- and the
 *     *capture condition* required a heart too, so gating only the
 *     assertion was not enough.
 *  2. Build the Word needs a word at box 2 (`MIN_BOX_TO_BUILD`), a fresh
 *     guest starts every word at box 0, and `recordCorrect` credits a
 *     word at most once per calendar day. A run that plays its way up
 *     therefore reaches box 1 and stops: no number of replays produces a
 *     build round at all. Seeding progress past box 2 fixes that much.
 *  3. Even seeded, the tile-tapping races the round handover, which is
 *     longer now every round waits out its closing audio.
 *
 * It had been failing on (1) and (2) since before this week, unnoticed,
 * because the suite ran nowhere but a developer's machine -- which is
 * the argument for the CI job that now runs it.
 *
 * Nothing depends on the picture: the README references eight
 * screenshots and none of them is this one, so the app is not
 * misrepresented by its absence. Worth fixing when Build the Word next
 * gets attention; not worth blocking a release for an unused image.
 *
 * Retargeted 2026-09-22: this was "a heart mid-build", and it asserted a
 * `tricky-*` marker was visible. The heart is switched off
 * (`HEART_MARKS_ENABLED`) because naming the tricky part inside a word
 * is not the method this child's programme teaches, so the picture it
 * took advertised a lesson the app no longer gives -- and the assertion
 * failed, correctly.
 *
 * The round is still worth a picture: it is the one that asks a child to
 * reproduce a whole spelling, and the README had no shot of it. So the
 * same replay is kept, the heart assertion is gated on the flag, and the
 * file it writes is named for the round rather than the mark.
 */
test.fixme('04 build the word -- a word part-built', async ({ page }) => {
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
  // Seeded at box 2, and that is not a convenience -- without it this
  // picture is unreachable. Build the Word needs a word at box 2
  // (`MIN_BOX_TO_BUILD`), a fresh guest starts every word at box 0, and
  // `recordCorrect` credits a word at most once per calendar day. So a
  // run that plays its way up gets every Set 10 word to box 1 and
  // stops: no replay count reaches a build round, and the eight below
  // were only ever burning the test timeout. (This test had been failing
  // for that reason as well as the heart one, unnoticed, because the
  // suite ran nowhere but a developer's machine.)
  //
  // The grown-up switch goes off with it, so the cycle is Find it and
  // Build the Word only: Read it would otherwise take half the varied
  // rounds and make the one this needs twice as rare. Nothing about the
  // picture changes -- Build the Word looks the same whoever is
  // watching.
  const seeded = DEFAULT_SETS.find((set) => set.id === 10)!.words.map((w) => w.id)
  await page.addInitScript((wordIds: string[]) => {
    const progress = Object.fromEntries(wordIds.map((id) => [id, {
      wordId: id, stage: 'reviewing', box: 2, dueInSessions: 0,
      correctStreak: 2, attempts: 2, lapses: 0, struggling: false,
      saidIt: 0, readToAdult: 0, lastCreditedOn: null,
    }]))
    sessionStorage.setItem('trickywords.guest', JSON.stringify({
      avatar: 'fox', progress, bestKnown: 0, lastSetId: 10,
      schoolSetId: null, grownUp: false, startedAt: Date.now(),
    }))
  }, seeded)

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
      // Every round holds itself open until its closing audio has been
      // heard, so there is a beat between rounds with no round on screen
      // at all. This loop drives itself rather than going through
      // `playSessionToCelebration`, so it needs that wait of its own --
      // without it, `detectRoundType` lands in the gap and reports no
      // round found.
      await expect
        .poll(async () => (await sessionFinished(page)) || roundOnScreen(page),
              { timeout: 25_000 })
        .toBe(true)
      if (await sessionFinished(page)) break
      const roundType = await detectRoundType(page)

      if (roundType === 'build') {
        if (await buildHeartWordToPartialReveal(page)) {
          if (HEART_MARKS_ENABLED) {
            await expect(page.locator('[data-testid^="tricky-"]').first()).toBeVisible()
          }
          await shot(page, '04-build-the-word.png')
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
  expect(
    captured,
    HEART_MARKS_ENABLED
      ? 'expected a Build the Word round part-built, with its heart showing'
      : 'expected a Build the Word round part-built, with tiles still to place',
  ).toBe(true)
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
