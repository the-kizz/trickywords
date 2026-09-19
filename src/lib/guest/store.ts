import type { WordProgress } from '@/lib/engine/types'
import { highWaterKnown } from '@/lib/rewards'

export const GUEST_KEY = 'trickywords.guest'

export interface GuestState {
  avatar: string | null
  progress: Record<string, WordProgress>
  /**
   * The most words this visitor has ever known at once -- what the
   * companion is drawn from, so a wrong tap can never shrink it. See
   * `highWaterKnown`.
   */
  bestKnown: number
  /**
   * The island this visitor last played, or null if they have not played
   * one yet -- the guest half of "where is they meant to be up to".
   *
   * Held here rather than in React state alone because the map's sense
   * of where they are has to survive a refresh: a pull-to-refresh on a
   * tablet used to put the companion, the pulse and the session back on
   * Set 1 whatever they had been playing. See `currentSet`.
   */
  lastSetId: number | null
  /**
   * The island an adult has said the class is working on, or null for
   * "not set" -- which is the normal state. Guest play has no parent
   * area and no server, so it is set on the map (see `SchoolSetPicker`)
   * or seeded from a shared `?set=N` link, and it lives only in this
   * tab's sessionStorage.
   */
  schoolSetId: number | null
  startedAt: number
}

const empty = (): GuestState => ({
  avatar: null, progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null,
  startedAt: Date.now(),
})

/**
 * Guest progress lives in sessionStorage, deliberately:
 *   - per tab, so two children on one device never collide and the
 *     server holds no per-visitor state at all
 *   - survives a refresh, so an accidental pull-to-refresh on a tablet
 *     does not wipe a child's game
 *   - gone when the tab closes, so nothing is retained
 *   - never sent to the server, unlike a cookie, so there is no consent
 *     obligation and nothing server-side to leak
 */
export function loadGuest(): GuestState {
  if (typeof sessionStorage === 'undefined') return empty()
  try {
    const raw = sessionStorage.getItem(GUEST_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<GuestState>
    const progress = parsed.progress ?? {}
    return {
      avatar: parsed.avatar ?? null,
      progress,
      // A record written before this field existed is seeded from what
      // it currently knows, so a visit in progress never looks as though
      // it has lost everything.
      bestKnown: highWaterKnown(
        parsed.bestKnown,
        Object.values(progress).filter((p) => p.stage === 'known').length,
      ),
      // A record written before this field existed has no island on it.
      // Null is not a guess: `currentSet` falls back to the furthest
      // island the progress itself shows they have touched, which is a
      // better answer than any default this could invent.
      lastSetId: typeof parsed.lastSetId === 'number' ? parsed.lastSetId : null,
      schoolSetId: typeof parsed.schoolSetId === 'number' ? parsed.schoolSetId : null,
      startedAt: parsed.startedAt ?? Date.now(),
    }
  } catch {
    // Corrupt state must never block a child from playing.
    return empty()
  }
}

export function saveGuest(state: GuestState): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private mode). Play continues in memory.
  }
}

export function clearGuest(): void {
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.removeItem(GUEST_KEY) } catch { /* ignore */ }
}
