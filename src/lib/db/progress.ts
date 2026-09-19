import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { progress, settings } from './schema'
import type { Stage, WordProgress } from '@/lib/engine/types'

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
 * are: it is not part of their progress, and a keyed row needs no
 * migration on a database a family updates by pulling a new image.
 *
 * Per child, because in a house with two children one may be reading to
 * a parent while the other plays on their own. It survives a reload on
 * purpose -- a parent who sits down for the evening should not have to
 * say so again after every session -- and it is not a lock or a gate:
 * all it changes is who judges a Read it round.
 */
const grownUpKey = (profileId: number) => `grownUp:${profileId}`

export function setGrownUpHere(
  db: Db, profileId: number, here: boolean, today: string,
): void {
  if (here) setSetting(db, grownUpKey(profileId), today)
  else clearSetting(db, grownUpKey(profileId))
}

/**
 * True only if a grown-up said so **today**.
 *
 * The day is stored with the flag rather than a bare `1`, because a flag
 * that never expires is a flag that is wrong most of the time. Left on
 * from one evening, the next morning a child alone meets a Read it round
 * and an adult's controls -- and taps one, because a five-year-old will
 * tap a button. That promotes a word nobody heard read. A grown-up who is
 * there again says so again; it is one tap and it is the truth.
 */
export function getGrownUpHere(db: Db, profileId: number, today: string): boolean {
  return getSetting(db, grownUpKey(profileId)) === today
}
