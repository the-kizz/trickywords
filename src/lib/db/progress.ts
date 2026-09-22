import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { progress, settings } from './schema'
import type { Stage, WordProgress } from '@/lib/engine/types'
import { GROWN_UP_DEFAULT } from '@/lib/teaching'

export function loadProgress(
  db: Db, profileId: number,
): Map<string, WordProgress> {
  const rows = db.select().from(progress)
    .where(eq(progress.profileId, profileId)).all()
  return new Map(rows.map((r) => [r.wordId, {
    wordId: r.wordId,
    stage: r.stage as Stage,
    box: r.box,
    dueInSessions: r.dueInSessions,
    correctStreak: r.correctStreak,
    attempts: r.attempts,
    lapses: r.lapses,
    struggling: r.struggling === 1,
    saidIt: r.saidIt,
    readToAdult: r.readToAdult ?? 0,
    lastCreditedOn: r.lastCreditedOn ?? null,
  }]))
}

export function saveProgress(
  db: Db, profileId: number, p: WordProgress,
): void {
  const values = {
    stage: p.stage, box: p.box, dueInSessions: p.dueInSessions,
    correctStreak: p.correctStreak, attempts: p.attempts,
    lapses: p.lapses, struggling: p.struggling ? 1 : 0,
    saidIt: p.saidIt ?? 0,
    readToAdult: p.readToAdult ?? 0,
    lastCreditedOn: p.lastCreditedOn ?? null,
  }
  db.insert(progress)
    .values({ profileId, wordId: p.wordId, ...values })
    .onConflictDoUpdate({
      target: [progress.profileId, progress.wordId],
      set: values,
    }).run()
}

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } }).run()
}

/** Removes a setting entirely -- how an optional setting becomes unset. */
export function clearSetting(db: Db, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run()
}

/**
 * The island a child was last on, and the island their class is working
 * on: two different facts, both per child, both kept as `settings` rows
 * rather than profile columns.
 *
 * A row rather than a column because neither belongs to the child's
 * *progress* -- one is a cursor the map restores, the other is a note a
 * parent leaves about school -- and because a keyed row needs no
 * migration on a database a family updates by pulling a new image.
 */
const lastSetKey = (profileId: number) => `lastSet:${profileId}`

/** Written as a session starts; read when the map first renders. */
export function setLastSetId(db: Db, profileId: number, setId: number): void {
  setSetting(db, lastSetKey(profileId), String(setId))
}

export function getLastSetId(db: Db, profileId: number): number | null {
  const raw = getSetting(db, lastSetKey(profileId))
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The island a child's class is working on, as an adult has said it --
 * *not* where the child is. The two are different facts and the map
 * shows both: see `ProgressMap`.
 *
 * Plainly optional. Unset is the normal state and the map looks exactly
 * as it did without it, which is why this clears rather than storing a
 * sentinel.
 */
const schoolSetKey = (profileId: number) => `schoolSet:${profileId}`

export function setSchoolSetId(
  db: Db, profileId: number, setId: number | null,
): void {
  if (setId === null) clearSetting(db, schoolSetKey(profileId))
  else setSetting(db, schoolSetKey(profileId), String(setId))
}

export function getSchoolSetId(db: Db, profileId: number): number | null {
  const raw = getSetting(db, schoolSetKey(profileId))
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Whether an adult is sitting with this child.
 *
 * A setting rather than a profile column for the same reason the others
 * are: it is not part of her progress, and a keyed row needs no
 * migration on a database a family updates by pulling a new image.
 *
 * Per child, because in a house with two children one may be reading to
 * a parent while the other plays alone.
 *
 * Stored explicitly as '1' or '0', with **absent meaning on** -- see
 * `GROWN_UP_DEFAULT`. The row therefore records a deliberate choice in
 * either direction and persists until changed; an earlier version stored
 * the day and expired overnight, which only made sense while the default
 * was off.
 */
const grownUpKey = (profileId: number) => `grownUp:${profileId}`

export function setGrownUpHere(
  db: Db, profileId: number, here: boolean,
): void {
  setSetting(db, grownUpKey(profileId), here ? '1' : '0')
}

export function getGrownUpHere(db: Db, profileId: number): boolean {
  const raw = getSetting(db, grownUpKey(profileId))
  return raw === null ? GROWN_UP_DEFAULT : raw === '1'
}
