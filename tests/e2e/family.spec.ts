import { test, expect, type Page } from '@playwright/test'
import { playSessionToCelebration } from './game-helpers'

const PIN = '1234'

/**
 * These tests share one running family server and its one seeded
 * database (Robin, Sam -- see `scripts/seed-demo.ts`), and run in
 * file order against it: the profile created in the first test is the
 * one the last test deletes. Serial mode makes that dependency explicit
 * instead of accidental.
 */
test.describe.configure({ mode: 'serial' })

async function unlockParentArea(page: Page, pin = PIN) {
  await page.goto('/parent', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/enter pin/i).fill(pin)
  await page.getByRole('button', { name: /unlock/i }).click()
}

async function profileHref(page: Page, name: string): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href')
  if (!href) throw new Error(`No profile link found for ${name}`)
  return href
}

test.describe('family mode', () => {
  test('creates a profile, plays a session, and progress survives a reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: 'Add someone' }).click()

    // Fresh seeded DB already has a PIN -- this is a normal unlock, not first-run setup.
    await page.getByLabel(/enter pin/i).fill(PIN)
    await page.getByRole('button', { name: /unlock/i }).click()

    await expect(page.getByRole('tablist', { name: /parent area sections/i })).toBeVisible()
    await page.getByLabel('Name').fill('Alex')
    await page.getByRole('button', { name: /add child/i }).click()
    await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible()

    const href = await profileHref(page, 'Alex')
    await page.goto(href, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await playSessionToCelebration(page)
    await page.getByTestId('continue-button').click()

    const setButton = page.getByRole('button', { name: /^Set 1,/ })
    await expect(setButton).toBeVisible()
    const labelAfterSession = await setButton.getAttribute('aria-label')
    expect(labelAfterSession).not.toMatch(/not started/)

    await page.reload({ waitUntil: 'domcontentloaded' })
    const labelAfterReload = await page.getByRole('button', { name: /^Set 1,/ }).getAttribute('aria-label')
    expect(labelAfterReload).toBe(labelAfterSession)
  })

  test('the parent PIN gate refuses a wrong PIN and accepts the right one', async ({ page }) => {
    await page.goto('/parent', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/enter pin/i).fill('0000')
    await page.getByRole('button', { name: /unlock/i }).click()
    // Next's own route announcer also carries role="alert", so scope to
    // the PinGate's own error text rather than the bare role.
    await expect(page.getByText(/not right/i)).toBeVisible()

    await page.getByLabel(/enter pin/i).fill(PIN)
    await page.getByRole('button', { name: /unlock/i }).click()
    await expect(page.getByRole('tablist', { name: /parent area sections/i })).toBeVisible()
  })

  test('shows per-word progress and the struggling note for a seeded child', async ({ page }) => {
    await unlockParentArea(page)

    const robinSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Robin', exact: true }) })
    await robinSection.getByText('Set 1 --').click()
    // Per-word progress: Set 1 is fully known, so each word's row reads
    // the plain-language "known" summary rather than "Not started yet."
    await expect(robinSection).toContainText('Known solidly')

    await robinSection.getByText('Set 10 --').click()
    // The struggling note: 'where' is seeded struggling, so its row
    // carries the "keeps slipping" summary instead.
    await expect(robinSection).toContainText('keeps slipping')
  })

  test('ticking a starting set updates the progress map', async ({ page }) => {
    await unlockParentArea(page)

    const samSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sam', exact: true }) })
    await samSection.getByText('Set starting point').click()
    await samSection.getByLabel('Set 1', { exact: true }).check()
    await samSection.getByRole('button', { name: /apply starting point/i }).click()
    await expect(samSection.getByRole('status')).toContainText("starting point is set")

    const href = await profileHref(page, 'Sam')
    await page.goto(href, { waitUntil: 'domcontentloaded' })
    const setButton = page.getByRole('button', { name: /^Set 1,/ })
    await expect(setButton).toHaveAttribute('aria-label', /finished/)
    await expect(setButton).toHaveAttribute('aria-label', /5 of 5 words known/)
  })

  test('deleting a profile removes it and its progress', async ({ page }) => {
    await unlockParentArea(page)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: "Delete Alex's profile" }).click()
    await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toHaveCount(0)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: 'Alex', exact: true })).toHaveCount(0)

    // No back door: the profiles API itself no longer has Alex either.
    const res = await page.request.get('/api/profiles')
    const body = (await res.json()) as { profiles: Array<{ name: string }> }
    expect(body.profiles.map((p) => p.name)).not.toContain('Alex')
  })
})
