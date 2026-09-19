import { test, expect, type Page } from '@playwright/test'
import { ADULT_TARGET_PX, MIN_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import {
  detectRoundType, pickFirstAvatar, playSessionToCelebration, solveCurrentRound,
} from './game-helpers'

/**
 * Layout claims that can only be checked by measuring a real browser:
 * nothing may leave the viewport sideways, and no two controls may sit
 * on top of each other. Both bugs this covers were invisible to the
 * unit suite -- jsdom has no layout -- and both were measured, not
 * eyeballed, in the review that found them.
 */

interface Box { x: number; y: number; width: number; height: number }

/**
 * Sub-pixel slack. A `boundingBox` is measured in device pixels and can
 * come back as 75.99997 for a 76px target; the tolerance is about
 * rounding, not about accepting a smaller target.
 */
const EPSILON = 0.5

const PHONE_WIDTHS = [360, 390]
const ALL_WIDTHS = [360, 390, 820, 1440]

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height
  )
}

function describeBox(label: string, b: Box): string {
  return `${label} x ${Math.round(b.x)}-${Math.round(b.x + b.width)} y ${Math.round(b.y)}-${Math.round(b.y + b.height)}`
}

test.describe('the absolute-positioned controls no longer collide', () => {
  for (const width of PHONE_WIDTHS) {
    test(`"Parent area" clears "Add someone" on the family home at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 380 ? 640 : 844 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      const parentLink = page.getByRole('link', { name: 'Parent area' })
      const addSomeone = page.getByRole('link', { name: 'Add someone' })
      const parentBox = (await parentLink.boundingBox())!
      const addBox = (await addSomeone.boundingBox())!
      console.log(`home ${width}px: ${describeBox('Parent area', parentBox)} / ${describeBox('Add someone', addBox)}`)

      expect(overlaps(parentBox, addBox), 'Parent area overlaps Add someone').toBe(false)
      expect(parentBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      expect(parentBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      await expect(parentLink).toHaveAccessibleName('Parent area')

      // It must also clear every profile tile, not just the last one.
      const tiles = page.getByRole('group', { name: /who's playing/i }).getByRole('link')
      for (let i = 0; i < (await tiles.count()); i++) {
        const box = (await tiles.nth(i).boundingBox())!
        expect(
          overlaps(parentBox, box),
          `Parent area overlaps ${await tiles.nth(i).getAttribute('aria-label')}`,
        ).toBe(false)
      }

      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
    })

    test(`"Back" clears the parent-area heading at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 380 ? 640 : 844 })
      await page.goto('/parent', { waitUntil: 'domcontentloaded' })
      await page.getByLabel(/enter pin/i).fill('1234')
      await page.getByRole('button', { name: /unlock/i }).click()
      await expect(page.getByRole('tablist', { name: /parent area sections/i })).toBeVisible()

      const back = page.getByRole('link', { name: 'Back to home' })
      const heading = page.getByRole('heading', { level: 1 })
      const backBox = (await back.boundingBox())!
      const headingBox = (await heading.boundingBox())!
      console.log(`parent ${width}px: ${describeBox('Back', backBox)} / ${describeBox('h1', headingBox)}`)

      expect(overlaps(backBox, headingBox), 'Back is drawn through the heading').toBe(false)
      expect(backBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      expect(backBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      await expect(back).toHaveAccessibleName('Back to home')

      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
    })
  }
})

test.describe('the map map reads in order on a phone, and lands on the right island', () => {
  for (const width of PHONE_WIDTHS) {
    test(`sets run top-to-bottom in ascending order at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 380 ? 640 : 844 })
      await page.goto('/play', { waitUntil: 'domcontentloaded' })
      await pickFirstAvatar(page)

      const islands = page.getByRole('group', { name: 'Word set map' }).getByRole('button')
      const count = await islands.count()
      expect(count).toBeGreaterThan(3)

      const boxes: Box[] = []
      for (let i = 0; i < count; i++) {
        const box = (await islands.nth(i).boundingBox())!
        const name = (await islands.nth(i).getAttribute('aria-label'))!.split(',')[0]
        console.log(`map ${width}px: ${describeBox(name, box)}`)
        boxes.push(box)
      }

      // Reading order must never contradict counting order: at two
      // columns the 4-step wave put Set 4 above Set 3 (and 8 above 7,
      // 12 above 11), so a child read the sets out of sequence.
      for (let i = 1; i < boxes.length; i++) {
        expect(
          boxes[i].y,
          `Set ${i + 1} is drawn above Set ${i}: ${describeBox(`set${i}`, boxes[i - 1])} / ${describeBox(`set${i + 1}`, boxes[i])}`,
        ).toBeGreaterThanOrEqual(boxes[i - 1].y - EPSILON)
        // Same row: the later set must be to the right of the earlier.
        if (Math.abs(boxes[i].y - boxes[i - 1].y) < 1) {
          expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
        }
      }

      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
    })

    test(`the island the child is on is in view on load at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 380 ? 640 : 844 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const href = await page.getByRole('link', { name: 'Robin', exact: true }).getAttribute('href')
      await page.goto(href!, { waitUntil: 'domcontentloaded' })

      // Whichever island the map calls current, not a particular one:
      // the last island played is now remembered across visits, so which
      // island that is depends on what this profile has done -- and the
      // invariant worth holding is that they can see where they are without
      // scrolling, whichever island it is. Hard-coding Set 2 here made
      // this test depend on no other test having played Robin first.
      const here = page.getByRole('button', { name: /where you are/ })
      const label = await here.getAttribute('aria-label')
      const box = (await here.boundingBox())!
      const viewport = page.viewportSize()!
      console.log(`map ${width}px on load: ${describeBox(label ?? 'here', box)} (viewport h ${viewport.height})`)

      // Practically in view, rather than pixel-perfectly framed: the
      // island art is lazy-loaded, so a few pixels of layout can still
      // settle after the scroll has happened.
      const visible =
        Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0)
      expect(
        visible / box.height,
        `${label} is only ${Math.round(visible)}px of ${Math.round(box.height)}px in view` +
        ` (y ${Math.round(box.y)}, viewport h ${viewport.height})`,
      ).toBeGreaterThan(0.9)
    })

    test(`"Back" clears the child's name and the map at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 380 ? 640 : 844 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const href = await page.getByRole('link', { name: 'Robin', exact: true }).getAttribute('href')
      await page.goto(href!, { waitUntil: 'domcontentloaded' })

      // The map scrolls the child's own island into view on load,
      // which can carry the header off the top -- so let that happen
      // first, then measure the header row where a child meets it: at
      // the top of the page.
      await expect(page.getByRole('button', { name: /^Set 1,/ })).toBeVisible()
      await page.waitForTimeout(500)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(200)
      const back = page.getByRole('link', { name: "Back to who's playing" })
      const backBox = (await back.boundingBox())!
      const heading = page.getByRole('heading', { level: 1 })
      const headingBox = (await heading.boundingBox())!
      console.log(`play ${width}px: ${describeBox('Back', backBox)} / ${describeBox('h1', headingBox)}`)

      expect(overlaps(backBox, headingBox), 'Back is drawn through the name').toBe(false)
      expect(backBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      expect(backBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      await expect(back).toHaveAccessibleName("Back to who's playing")

      const islands = page.getByRole('group', { name: 'Word set map' }).getByRole('button')
      for (let i = 0; i < (await islands.count()); i++) {
        const box = (await islands.nth(i).boundingBox())!
        expect(
          overlaps(backBox, box),
          `Back overlaps ${await islands.nth(i).getAttribute('aria-label')}`,
        ).toBe(false)
      }

      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
    })
  }

  /**
   * The map used to say "Nothing much is due today, so this will be a
   * short go." It was false in both directions and it said "today" about
   * a schedule counted in sessions. A short go needs no explanation: the
   * round pips already show how many rounds there are.
   */
  test('the map never explains how long the next go will be', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await pickFirstAvatar(page)

    await expect(page.getByTestId('short-session-note')).toHaveCount(0)

    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await playSessionToCelebration(page)
    await page.getByTestId('continue-button').click()

    await expect(page.getByTestId('short-session-note')).toHaveCount(0)
    expect((await page.locator('main').innerText()).toLowerCase())
      .not.toContain('nothing much is due')
  })
})

/**
 * The way out of a running session, measured.
 *
 * The claim is not just that a Back control exists -- it is that it is
 * nowhere near the answers. The guest side's "Start again" sat 56px
 * directly *under* the answer buttons, which is the single most likely
 * place in the app for a five-year-old's finger to land by mistake; that
 * is the mistake this control is placed to avoid, so the gap is
 * asserted, not eyeballed.
 */
test.describe('a child can leave a running session', () => {
  /** The vertical gap between the Back control and the nearest answer. */
  const MIN_GAP_PX = 120

  for (const width of ALL_WIDTHS) {
    test(`Back is well clear of the answers at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
      await page.goto('/play', { waitUntil: 'domcontentloaded' })
      await pickFirstAvatar(page)
      await page.getByRole('button', { name: /^Set 1,/ }).click()
      // A fresh guest's Set 1 words are all at box 0, so every round
      // here is a Find it and the answers being measured are the same
      // shape at every width: its choice buttons.
      await expect(page.getByTestId('round-counter')).toBeVisible()

      const back = page.getByTestId('session-back')
      const backBox = (await back.boundingBox())!
      expect(backBox.height, 'Back is under the target floor')
        .toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      expect(backBox.width, 'Back is under the target floor')
        .toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
      await expect(back).toHaveAccessibleName('Back to the map')

      // A box-0 round opens on the written word alone; the answers
      // arrive once it has been said and has faded.
      await expect(page.getByTestId('choices')).toBeVisible()
      const answers = page.getByTestId('choices').getByRole('button')
      let nearest = Number.POSITIVE_INFINITY
      for (let i = 0; i < (await answers.count()); i++) {
        const box = (await answers.nth(i).boundingBox())!
        expect(overlaps(backBox, box), 'Back is drawn over an answer').toBe(false)
        nearest = Math.min(nearest, box.y - (backBox.y + backBox.height))
      }
      console.log(
        `session Back ${width}px: ${describeBox('Back', backBox)}` +
        ` / gap to nearest answer ${Math.round(nearest)}px`,
      )
      expect(nearest, 'Back is too close to the answers').toBeGreaterThanOrEqual(MIN_GAP_PX)
      expect(await hasHorizontalScroll(page), 'the session scrolls sideways').toBe(false)
    })
  }

  /**
   * Non-destructive, end to end: the words a child answered before
   * leaving are still theirs when they get back to the map, and still
   * theirs after a reload -- which is the only proof that the
   * per-answer write to `/api/progress` really happened and that
   * leaving rolled nothing back.
   *
   * Sam's Set 1 is put at box 4 through the same API the app writes
   * with, so one unaided correct answer promotes a word to box 5 --
   * "known" -- and the map's own island label counts it. That makes the
   * claim measurable: the number must go up during the session and must
   * still be up after leaving mid-session. The rows are put back
   * afterwards, so the rest of the serial suite sees the demo family it
   * expects.
   */
  test('leaving keeps the progress already earned', async ({ page }) => {
    const setOne = DEFAULT_SETS[0]

    async function seed(box: number, stage: string) {
      for (const word of setOne.words) {
        const res = await page.request.post('/api/progress', {
          data: {
            profileId: samId,
            progress: {
              wordId: word.id, stage, box, dueInSessions: 0,
              correctStreak: 0, attempts: 0, lapses: 0, struggling: false,
            },
          },
        })
        expect(res.status(), await res.text()).toBe(200)
      }
    }

    const body = (await (await page.request.get('/api/profiles')).json()) as {
      profiles: Array<{ id: number; name: string }>
    }
    const samId = body.profiles.find((p) => p.name === 'Sam')!.id

    const wordsKnown = (label: string) => Number(/(\d+) of \d+ words known/.exec(label)![1])

    try {
      await seed(4, 'reviewing')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/play/${samId}`, { waitUntil: 'domcontentloaded' })

      const setButton = page.getByRole('button', { name: /^Set 1,/ })
      const before = (await setButton.getAttribute('aria-label'))!
      await setButton.click()

      // Two rounds played, then out -- mid-session, deliberately.
      for (let i = 0; i < 2; i++) {
        await solveCurrentRound(page, await detectRoundType(page))
        await page.waitForTimeout(200)
      }
      await expect(page.getByTestId('celebration')).toHaveCount(0)
      await page.getByTestId('session-back').click()

      // Back on the map, with no celebration and nothing cleared.
      await expect(page.getByRole('group', { name: 'Word set map' })).toBeVisible()
      await expect(page.getByTestId('round-counter')).toHaveCount(0)
      await expect(page.getByTestId('celebration')).toHaveCount(0)

      const after =
        (await page.getByRole('button', { name: /^Set 1,/ }).getAttribute('aria-label'))!
      await page.reload({ waitUntil: 'domcontentloaded' })
      const reloaded =
        (await page.getByRole('button', { name: /^Set 1,/ }).getAttribute('aria-label'))!
      console.log(
        `Set 1 before: ${before}\n  after leaving: ${after}\n  after reload: ${reloaded}`,
      )

      // The answers a child gave before leaving are on the map they
      // come back to, and in the database a reload reads from.
      expect(wordsKnown(after), 'nothing was credited for the rounds played')
        .toBeGreaterThan(wordsKnown(before))
      expect(reloaded, 'leaving mid-session rolled progress back').toBe(after)
    } finally {
      // Sam has no progress in the seeded demo family -- put that back.
      await seed(0, 'new')
    }
  })
})

test.describe('the parent Word sets tab is usable on a phone', () => {
  test('no horizontal scroll and a sane height at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/parent', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/enter pin/i).fill('1234')
    await page.getByRole('button', { name: /unlock/i }).click()
    await page.getByRole('tab', { name: 'Word sets' }).click()

    const save = page.getByRole('button', { name: 'Save word sets' })
    await expect(save).toBeVisible()

    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    console.log(`parent word sets 390px: page height ${height}px, h-scroll ${await hasHorizontalScroll(page)}`)
    // Was 23,132px with every set and every word expanded.
    expect(height, 'the tab is still absurdly tall').toBeLessThan(4000)
    expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)

    // Every set is a child-sized target, and opening one still fits.
    const summaries = page.locator('details > summary')
    const count = await summaries.count()
    expect(count).toBeGreaterThan(1)
    for (let i = 0; i < count; i++) {
      const box = (await summaries.nth(i).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
    }

    await summaries.first().click()
    await expect(page.getByRole('button', { name: 'Move set down' }).first()).toBeVisible()
    const openBoxes: Box[] = []
    for (const name of ['Set name', 'Word', 'Word type', 'Example sentence']) {
      const field = page.getByLabel(name, { exact: true }).first()
      const box = (await field.boundingBox())!
      console.log(`parent word sets 390px open: ${describeBox(name, box)}`)
      openBoxes.push(box)
      expect(box.x + box.width, `${name} runs off the right`).toBeLessThanOrEqual(390 + EPSILON)
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - EPSILON)
    }
    expect(openBoxes.length).toBe(4)
    expect(await hasHorizontalScroll(page), 'the page scrolls sideways once a set is open').toBe(false)
  })

  /**
   * One parent page: three tabs, and every adult control at the adult
   * floor. The Games tab is gone with the per-child game toggles -- with
   * two round types chosen by the session there was nothing left to
   * toggle.
   */
  test('has three tabs, no Games tab, and adult-sized controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/parent', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/enter pin/i).fill('1234')
    await page.getByRole('button', { name: /unlock/i }).click()

    await expect(page.getByRole('tab')).toHaveCount(3)
    await expect(page.getByRole('tab', { name: 'Games' })).toHaveCount(0)
    for (const name of ['Children', 'Word sets', 'Voices']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }

    await page.getByRole('tab', { name: 'Children' }).click()
    const summaries = page.locator('details > summary')
    const count = await summaries.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const box = (await summaries.nth(i).boundingBox())!
      expect(box.height, 'a child-progress row is under the adult floor')
        .toBeGreaterThanOrEqual(ADULT_TARGET_PX - EPSILON)
    }

    await summaries.first().click()
    const boxes = page.locator('input[type="checkbox"]')
    const boxCount = await boxes.count()
    expect(boxCount).toBeGreaterThan(0)
    for (let i = 0; i < boxCount; i++) {
      const box = (await boxes.nth(i).boundingBox())!
      console.log(`starting-point tick box ${i}: ${Math.round(box.width)}x${Math.round(box.height)}`)
      expect(box.width).toBeGreaterThanOrEqual(ADULT_TARGET_PX - EPSILON)
      expect(box.height).toBeGreaterThanOrEqual(ADULT_TARGET_PX - EPSILON)
    }
  })
})
