import { newProgress, MAX_BOX } from '@/lib/engine/ladder'
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
   * one yet -- the guest half of "where are they meant to be up to".
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
   * or seeded from a shared `?set=N` link, and it lives on this device.
   */
  schoolSetId: number | null
  /**
   * Whether an adult is sitting with this visitor, or null for "nobody
   * has said" -- which reads as the default, see `GROWN_UP_DEFAULT`.
   *
   * Guest play has no server and no parent area, so this is set on the
   * map beside the class picker and lives on this device. It is the
   * same switch the family map carries and it
   * changes the same one thing: who judges a Read it round, and so
   * whether a reading can move the word up the ladder.
   */
  grownUp: boolean | null
  startedAt: number
}

const empty = (): GuestState => ({
  avatar: null, progress: {}, bestKnown: 0, lastSetId: null, schoolSetId: null,
  grownUp: null,
  startedAt: Date.now(),
})

/**
 * Guest progress lives in the browser's localStorage, on purpose:
 *
 *   - **it survives the tab closing.** It used to be sessionStorage,
 *     which is gone when the tab goes -- and the public page is the one
 *     actually used, so every visit started every word at box 0: two
 *     choices, word shown first, maximum support, forever. Difficulty
 *     never rose, and Read it -- which needs box 1 -- could never appear
 *     on a first visit at all. The spaced repetition this app is built
 *     on was doing nothing on the surface people play.
 *   - **one record per device.** The avatar is a costume, not a key:
 *     children pick a different friend each time because there are so
 *     many, and progress keyed to a friend would scatter across eight
 *     of them. So there is one record, the picker shows every visit,
 *     and any friend picked keeps what has been learned. Two children
 *     on one device is what the family surface's real profiles are for;
 *     on this surface, "Start again" is the reset.
 *   - **still no server, no cookie, no name.** localStorage is the same
 *     legal category as sessionStorage -- never sent anywhere, no
 *     consent obligation, nothing server-side to leak. A full record is
 *     about 10KB against a ~5MB per-site quota.
 *   - survives a refresh, so a pull-to-refresh on a tablet does not
 *     wipe a game.
 *
 * `loadGuest` adopts a record left in sessionStorage by the version
 * before this one, so a tab that was open across the upgrade keeps its
 * game.
 */
function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // Some browsers throw on the mere access in private mode.
    return null
  }
}

/**
 * Keeps only the progress entries the engine can actually use: an object
 * with an integer box in range and a known stage. Found by fuzzing the
 * store with garbage: `{"progress":{"the":5}}` or an array where the
 * map should be used to pass straight through, and the first answer
 * would then spread a number into a record and write `NaN` boxes back.
 * A record from a future version with extra fields is kept; one with
 * the wrong shape is dropped, word by word, not the whole visit.
 */
const STAGES = new Set(['new', 'learning', 'reviewing', 'known'])
function usableProgress(raw: unknown): GuestState['progress'] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: GuestState['progress'] = {}
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) continue
    const r = p as Record<string, unknown>
    if (!Number.isInteger(r.box) || (r.box as number) < 0 || (r.box as number) > MAX_BOX) continue
    if (typeof r.stage !== 'string' || !STAGES.has(r.stage)) continue
    if (!Number.isInteger(r.dueInSessions)) continue
    out[id] = { ...newProgress(id), ...(r as object), wordId: id } as WordProgress
  }
  return out
}

function normalise(parsed: Partial<GuestState>): GuestState {
  const progress = usableProgress(parsed.progress)
  return {
    // Only a string names a friend; anything else would render as a
    // broken picture and skip the picker (found by fuzzing).
    avatar: typeof parsed.avatar === 'string' && parsed.avatar.length <= 64 ? parsed.avatar : null,
    progress,
    // A record written before this field existed is seeded from what
    // it currently knows, so a visit in progress never looks as though
    // it has lost everything.
    bestKnown: highWaterKnown(
      Number.isInteger(parsed.bestKnown) && (parsed.bestKnown as number) >= 0 ? parsed.bestKnown : undefined,
      Object.values(progress).filter((p) => p.stage === 'known').length,
    ),
    // A record written before this field existed has no island on it.
    // Null is not a guess: `currentSet` falls back to the furthest
    // island the progress itself shows they have touched, which is a
    // better answer than any default this could invent.
    lastSetId: Number.isInteger(parsed.lastSetId) ? (parsed.lastSetId as number) : null,
    schoolSetId: Number.isInteger(parsed.schoolSetId) ? (parsed.schoolSetId as number) : null,
    // Null, not `GROWN_UP_DEFAULT`, for a record written before this
    // field existed: null *reads* as the default wherever it is used,
    // and keeping it null means the default can change later without
    // every stored visit carrying the old one.
    grownUp: typeof parsed.grownUp === 'boolean' ? parsed.grownUp : null,
    startedAt: Number.isFinite(parsed.startedAt) ? (parsed.startedAt as number) : Date.now(),
  }
}

export function loadGuest(): GuestState {
  const store = storage()
  if (!store) return empty()
  try {
    let raw = store.getItem(GUEST_KEY)
    if (!raw && typeof sessionStorage !== 'undefined') {
      // The version before this one kept the record per tab. A tab open
      // across the upgrade still has it there; take it, once.
      const legacy = sessionStorage.getItem(GUEST_KEY)
      if (legacy) {
        store.setItem(GUEST_KEY, legacy)
        sessionStorage.removeItem(GUEST_KEY)
        raw = legacy
      }
    }
    if (!raw) return empty()
    return normalise(JSON.parse(raw) as Partial<GuestState>)
  } catch {
    // Corrupt state must never block a child from playing.
    return empty()
  }
}

export function saveGuest(state: GuestState): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(GUEST_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked. Play continues in memory.
  }
}

export function clearGuest(): void {
  const store = storage()
  if (!store) return
  try { store.removeItem(GUEST_KEY) } catch { /* ignore */ }
}
