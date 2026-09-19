import { defineConfig, devices } from '@playwright/test'
import { APP_PORT, FAMILY_PORT, PUBLIC_PORT, familyURL, publicURL } from './tests/e2e/ports'

/**
 * One server, two surfaces — the same shape the container runs.
 *
 * `docker/entrypoint.mjs` is what actually starts here: it spawns the
 * Next app on loopback, puts the unfiltered family listener in front of
 * it, and (because TRICKYWORDS_PUBLIC is set) the deny-by-default guest
 * listener as well. The `public` project therefore targets the guest
 * port of this same server, which means the isolation suite exercises
 * the real allowlist and the real surface-header injection rather than a
 * second server started in a different mode.
 *
 * The server runs a **production** build, not `next dev`. That is not an
 * optimisation, it is a requirement: `next dev`'s client needs dev-only
 * endpoints (`/_next/hmr` among them) that the guest allowlist rightly
 * refuses, so the guest page cannot hydrate behind it. Rather than
 * poking holes in the security boundary to suit the test harness, the
 * harness builds and serves the app the way the container does.
 * TRICKYWORDS_APP_ARGV points the entrypoint at `next start` instead of
 * the standalone `server.js`, which is the same server without the
 * asset-copying the image does; it is a test hook and production never
 * sets it. `next start` warns that it ignores `output: 'standalone'` --
 * that is expected and is exactly what is wanted here: it serves
 * straight out of the dist directory instead of the standalone bundle.
 *
 * `webServer` is a top-level, not a per-project, setting in Playwright,
 * so this one server starts for any test run regardless of which
 * project(s) are selected.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  // Generous: the family-mode "create, play a full session, reload"
  // test and the games-rotation test each drive a real 10-round session
  // through actual navigation and network round trips, which comfortably
  // clears 45s under load but needs headroom, not a tighter budget.
  timeout: 120_000,
  use: {
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'family',
      testMatch: [
        'chooser.spec.ts', 'family.spec.ts', 'games.spec.ts', 'layout.spec.ts',
        'misses.spec.ts', 'screenshots.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], baseURL: familyURL },
    },
    {
      name: 'public',
      testMatch: ['public-mode.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: publicURL },
    },
  ],
  webServer: [
    {
      command:
        `bash -c "mkdir -p data && ` +
        `TRICKYWORDS_DB=./data/demo.db npx tsx scripts/seed-demo.ts && ` +
        // Its own dist dir, so the suite never clobbers (or fights the
        // lockfile of) a `npm run dev` in the same checkout -- see
        // next.config.ts.
        `NEXT_DIST_DIR=.next-e2e-server npx next build && ` +
        `NEXT_DIST_DIR=.next-e2e-server ` +
        `TRICKYWORDS_MODE=family TRICKYWORDS_DB=./data/demo.db ` +
        `TRICKYWORDS_PUBLIC=1 ` +
        `TRICKYWORDS_FAMILY_PORT=${FAMILY_PORT} ` +
        `TRICKYWORDS_PUBLIC_PORT=${PUBLIC_PORT} ` +
        `TRICKYWORDS_APP_PORT=${APP_PORT} ` +
        `TRICKYWORDS_APP_ARGV='node_modules/next/dist/bin/next start' ` +
        `node docker/entrypoint.mjs"`,
      // Waiting on the guest port, not the family one: it is the later
      // of the two to be useful, and a 200 here proves both listeners
      // and the allowlist are up.
      url: `${publicURL}/api/health`,
      reuseExistingServer: false,
      // Headroom for the production build this starts with.
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
