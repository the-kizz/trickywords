import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { silence } from '@/lib/audio/player'

// RTL does not auto-register cleanup unless vitest `globals` is enabled.
// Without this, DOM from one test's render() leaks into the next test,
// which breaks any test file (like clay.test.tsx) that renders more than
// once and queries by role/testid.
afterEach(() => {
  cleanup()
})

// The audio channel is deliberately module-level -- one child, one pair
// of ears -- which means it is also shared by every test in a file. A
// test that leaves a clip queued (or leaves the channel mid-clip when
// fake timers are torn down) would otherwise push the next test's
// `enqueue` behind a queue that no longer exists. Each test starts in
// silence, exactly as a child arriving at the app does.
beforeEach(() => {
  silence()
})

/**
 * A fixed day, for the whole suite.
 *
 * `roundTypeFor` steps a word one place along its cycle for each
 * calendar day, so which round a word gets is a function of the date --
 * by design, so that tomorrow differs from today without any history
 * being stored. The cost is that a test which plays a session and
 * expects a particular round is really asserting something about the
 * calendar, and will pass or fail depending on the day it is run.
 *
 * That was theoretical while every decodable word's cycle was `['find']`
 * alone. Adding Read it gave those words a two-long cycle, and the suite
 * started failing every other day: `that` at box 3 is a Find on
 * 2026-09-19, a Read on the 20th, a Find on the 21st. Seven tests went
 * red overnight with no code change behind them.
 *
 * So the clock is pinned here rather than in the handful of files that
 * happened to notice. A test that cares about the rotation should pass
 * the day to `roundTypeFor` itself, which is why that function takes one.
 *
 * Chosen because it is a Saturday, and because `that` rotates to Find on
 * it -- the round most of these tests were written against.
 */
export const TEST_DAY = new Date('2026-09-19T09:00:00')

beforeEach(() => {
  vi.setSystemTime(TEST_DAY)
})

afterEach(() => {
  vi.useRealTimers()
})
