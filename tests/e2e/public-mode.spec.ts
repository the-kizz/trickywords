import { test, expect, type Page } from '@playwright/test'
import { MIN_TARGET_PX } from '@/lib/constants'
import { pickFirstAvatar, playSessionToCelebration } from './game-helpers'
import { familyURL, publicURL } from './ports'

/**
 * The highest-value suite in this project: it proves the privacy claim
 * the README makes about the guest surface. Every assertion here
 * matters.
 *
 * This project's baseURL is the **guest port of the same server** the
 * family suite uses. One container serves both, so these tests exercise
 * the real thing: the deny-by-default allowlist in the guest listener,
 * and the surface header it injects for the app-level guard behind it.
 * Cross-checking the same paths against `familyURL` is what proves the
 * 404s come from the boundary and not from the routes being broken.
 *
 * Navigation deliberately avoids `waitUntil: 'networkidle'` -- Next.js
 * keeps prefetch connections open, so networkidle reliably times out on
 * these pages. `domcontentloaded` plus explicit waits on real elements
 * (or a short settle delay for the network-request test) is used
 * instead; this changes how the tests wait, never what they assert.
 */
test.describe('public mode', () => {
  test('does not serve the parent area', async ({ page }) => {
    const res = await page.goto('/parent', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(404)
  })

  test('does not accept progress writes', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: { profileId: 1, progress: {} },
    })
    expect(res.status()).toBe(404)
  })

  test('does not serve the profiles API', async ({ request }) => {
    expect((await request.get('/api/profiles')).status()).toBe(404)
  })

  test('reports public mode on the health endpoint', async ({ request }) => {
    const body = await (await request.get('/api/health')).json()
    expect(body.mode).toBe('public')
  })

  test('never asks a child for a name', async ({ page }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    await expect(page.locator('input[type="text"]')).toHaveCount(0)
  })

  test('exposes no child profile name anywhere in the served HTML', async ({ page }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    const html = await page.content()
    for (const name of ['Robin', 'Sam', 'Alex']) {
      expect(html).not.toContain(name)
    }
  })

  test('keeps guest progress per tab and clears it on Start again', async ({ page }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    await pickFirstAvatar(page)
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .not.toBeNull()

    await page.reload({ waitUntil: 'domcontentloaded' })
    // A fumbled pull-to-refresh must not wipe a child's game.
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .not.toBeNull()

    // Two taps, not one -- see the placement suite below.
    await page.getByTestId('start-again-ask').click()
    await page.getByTestId('start-again-confirm').click()
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .toBeNull()
  })

  /**
   * The biggest child-facing risk the review found, and the shape of
   * the fix.
   *
   * "Start again" wipes the visit -- progress, avatar, companion -- with
   * no undo, because there is nowhere to undo it from. It used to sit
   * 56px directly below the answer buttons of a live round: the single
   * most likely place in the app for a five-year-old's finger to land
   * by mistake. It is now on the map only, and it takes two taps.
   */
  test.describe('Start again cannot be hit by accident', () => {
    async function startASession(page: Page) {
      await page.goto('/play', { waitUntil: 'domcontentloaded' })
      await pickFirstAvatar(page)
      await page.getByRole('button', { name: /^Set 1,/ }).click()
      await expect(page.getByTestId('round-counter')).toBeVisible()
    }

    test('is not on the session screen at all', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await startASession(page)
      await expect(page.getByTestId('start-again')).toHaveCount(0)
      await expect(page.getByTestId('start-again-ask')).toHaveCount(0)
      await expect(page.getByTestId('start-again-confirm')).toHaveCount(0)
      expect((await page.locator('body').innerText()).toLowerCase())
        .not.toContain('start again')
    })

    test('one tap on the map asks, and clears nothing', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/play', { waitUntil: 'domcontentloaded' })
      await pickFirstAvatar(page)
      const before = await page.evaluate(() => sessionStorage.getItem('trickywords.guest'))
      expect(before).not.toBeNull()

      const ask = page.getByTestId('start-again-ask')
      expect((await ask.boundingBox())!.height)
        .toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
      await expect(ask).toHaveAccessibleName(/start again/i)
      await ask.click()

      // The single tap changed nothing.
      expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
        .toBe(before)
      const confirm = page.getByTestId('start-again-confirm')
      await expect(confirm).toBeVisible()
      await expect(confirm).toHaveAccessibleName(/yes, start again/i)
      expect((await confirm.boundingBox())!.height)
        .toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)

      // Changing their mind keeps everything, too.
      await page.getByTestId('start-again-cancel').click()
      expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
        .toBe(before)
      await expect(page.getByTestId('start-again-ask')).toBeVisible()

      // And the second tap, when it is meant, does the job.
      await page.getByTestId('start-again-ask').click()
      await page.getByTestId('start-again-confirm').click()
      expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
        .toBeNull()
      await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    })

    test('reads plainly, with nothing alarming in it', async ({ page }) => {
      await page.goto('/play', { waitUntil: 'domcontentloaded' })
      await pickFirstAvatar(page)
      await page.getByTestId('start-again-ask').click()
      const text = (await page.getByTestId('start-again').innerText()).toLowerCase()
      for (const alarming of [
        'delete', 'warning', 'cannot be undone', 'permanently', 'lose', 'erase', 'wipe',
      ]) {
        expect(text, alarming).not.toContain(alarming)
      }
      expect(text).toContain('start again for someone new?')
      expect(text).toContain('no, keep playing')
    })
  })

  test('gives two tabs independent progress, so guests never collide', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/play', { waitUntil: 'domcontentloaded' })
    await b.goto('/play', { waitUntil: 'domcontentloaded' })
    await pickFirstAvatar(a)
    // The claim is per-tab isolation, so both halves matter: tab A did
    // record something, and tab B still has not.
    expect(await a.evaluate(() => sessionStorage.getItem('trickywords.guest'))).not.toBeNull()
    expect(await b.evaluate(() => sessionStorage.getItem('trickywords.guest'))).toBeNull()
  })

  test('sets no cookies across a full guest play session', async ({ page, context }) => {
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    expect(await context.cookies()).toHaveLength(0)

    // Not just the landing page: pick an avatar, start a set, and play
    // an actual round -- the "no cookies" claim in the README covers the
    // whole guest flow, not only the initial load.
    await pickFirstAvatar(page)
    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await playSessionToCelebration(page)
    expect(await context.cookies()).toHaveLength(0)
  })

  test('makes no external network requests across a full guest play session', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const host = new URL(r.url()).hostname
      if (!['localhost', '127.0.0.1'].includes(host)) external.push(r.url())
    })
    await page.goto('/play', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()

    // Play an entire session -- pick an avatar, start a set, answer
    // every round to celebration -- so the "no external requests" claim
    // holds for real gameplay, not only the landing page.
    await pickFirstAvatar(page)
    await page.getByRole('button', { name: /^Set 1,/ }).click()
    await playSessionToCelebration(page)

    // networkidle is not usable here (Next.js prefetch keeps connections
    // open indefinitely) -- give in-flight requests a fixed settle
    // window instead.
    await page.waitForTimeout(2000)
    expect(external).toEqual([])
  })

  test('honours a shared set link', async ({ page }) => {
    await page.goto('/play?set=3', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/set 3/i)).toBeVisible()
  })

  test('does not serve the family play route for a named child', async ({ page }) => {
    const res = await page.goto('/play/1', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(404)
  })

  /**
   * `/` is the link a human actually shares, so it has to land on the
   * game. The guest listener answers it with a redirect itself -- `/` is
   * NOT on the allowlist, so the app never sees it on this port and the
   * family profile chooser cannot be rendered here even if the app-level
   * guard were broken.
   */
  test('sends the shared root link to the guest home, not a 404', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/play$/)
    await expect(page.getByTestId(/^avatar-/).first()).toBeVisible()
    // And it is the guest home, not the family one.
    await expect(page.locator('input[type="text"]')).toHaveCount(0)
    const html = await page.content()
    for (const name of ['Robin', 'Sam', 'Alex']) {
      expect(html).not.toContain(name)
    }
  })

  test('keeps the query on that redirect, so a shared per-set link still works', async ({ page }) => {
    await page.goto('/?set=3', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/play\?set=3$/)
    await expect(page.getByText(/set 3/i)).toBeVisible()
  })

  test('redirects the root without ever forwarding it to the app', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toBe('/play')
    const withQuery = await request.get('/?set=3', { maxRedirects: 0 })
    expect(withQuery.status()).toBe(302)
    expect(withQuery.headers()['location']).toBe('/play?set=3')
  })

  /**
   * The same four paths, on both published ports of the one server.
   * 404 on the guest port and working on the family port is the whole
   * claim -- either half alone would pass for the wrong reason.
   */
  test.describe('the family surface is absent on the guest port and present on the family port', () => {
    test('/parent', async ({ request }) => {
      expect((await request.get('/parent')).status()).toBe(404)
      expect((await request.get(`${familyURL}/parent`)).status()).toBe(200)
    })

    test('/api/profiles', async ({ request }) => {
      expect((await request.get('/api/profiles')).status()).toBe(404)
      const family = await request.get(`${familyURL}/api/profiles`)
      expect(family.status()).toBe(200)
      expect((await family.json()).profiles.length).toBeGreaterThan(0)
    })

    test('/api/progress', async ({ request }) => {
      // A real single-word payload, so the family side exercises an
      // actual write rather than erroring on a malformed body. The word
      // id belongs to no set, so the upsert cannot disturb the demo
      // family's own progress.
      const body = {
        profileId: 1,
        progress: {
          wordId: 'e2e-surface-probe',
          stage: 'learning',
          box: 0,
          dueInSessions: 0,
          correctStreak: 0,
          attempts: 1,
          lapses: 0,
          struggling: false,
        },
      }
      expect((await request.post('/api/progress', { data: body })).status()).toBe(404)
      const family = await request.post(`${familyURL}/api/progress`, { data: body })
      expect(family.status()).toBe(200)
      expect(await family.json()).toMatchObject({ ok: true })
    })

    test('/play/1', async ({ request }) => {
      // The route that renders one named child. 404 on the guest port,
      // and a real page -- carrying that child's name -- on the family
      // port.
      expect((await request.get('/play/1')).status()).toBe(404)
      const family = await request.get(`${familyURL}/play/1`)
      expect(family.status()).toBe(200)
      expect(await family.text()).toContain('Robin')
    })

    test('/', async ({ request }) => {
      // The other route that renders a child's name: the family profile
      // chooser. The guest port never serves it -- it redirects to the
      // game instead -- while the family port renders it in full.
      const guest = await request.get('/', { maxRedirects: 0 })
      expect(guest.status()).toBe(302)
      expect(guest.headers()['location']).toBe('/play')

      const family = await request.get(`${familyURL}/`)
      expect(family.status()).toBe(200)
      const html = await family.text()
      expect(html).toContain('Robin')
      expect(html).toContain('Parent area')
    })
  })

  test('404s traversal attempts at the family surface', async ({ request }) => {
    // Only forms an HTTP client transmits *literally* are useful here.
    // A real `/play/../parent` is collapsed to `/parent` by the client
    // before it ever leaves, so it would prove nothing about the
    // listener; those are covered exhaustively, as exact strings, by the
    // unit tests on `isPubliclyAllowed`. Each of these arrives at the
    // guest listener exactly as written -- percent-encoding survives
    // URL resolution, and the `//`-prefixed ones need an absolute URL
    // so they are not read as protocol-relative.
    for (const path of [
      '/..%2fparent',
      '/%2e%2e/parent',
      '/%2e%2e/api/profiles',
      '/%252e%252e/parent',
      '/%2e%2e%5cparent',
      '/.//parent',
      `${publicURL}//parent`,
      `${publicURL}//api//profiles`,
    ]) {
      expect((await request.get(path)).status(), path).toBe(404)
    }
  })

  test('ignores a forged surface header on either port', async ({ request }) => {
    // The header is an internal marker, not client input: both
    // listeners strip any inbound copy. So a caller cannot talk its way
    // past the allowlist with it...
    expect(
      (await request.get('/parent', { headers: { 'x-trickywords-surface': 'family' } })).status(),
    ).toBe(404)
    // ...and cannot reach the app-level guard through the family port
    // either. Forging it changes nothing; it could only ever restrict.
    expect(
      (await request.get(`${familyURL}/parent`, {
        headers: { 'x-trickywords-surface': 'public' },
      })).status(),
    ).toBe(200)
  })
})
