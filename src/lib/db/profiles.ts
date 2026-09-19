import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { profiles, progress } from './schema'

export interface Profile {
  id: number
  name: string
  avatar: string
  createdAt: number
  /**
   * The most words this child has ever known at once -- what the
   * companion and the sticker book are drawn from, so that nothing they
   * have earned is ever taken away. See `highWaterKnown`.
   */
  bestKnown: number
}

export function createProfile(
  db: Db, input: { name: string; avatar: string },
): Profile {
  const name = input.name.trim()
  if (!name) throw new Error('Profile name cannot be empty')
  const [row] = db.insert(profiles)
    .values({ name, avatar: input.avatar, createdAt: Date.now() })
    .returning().all()
  return row as Profile
}

export function listProfiles(db: Db): Profile[] {
  return db.select().from(profiles).all() as Profile[]
}

export function getProfile(db: Db, id: number): Profile | null {
  const row = db.select().from(profiles).where(eq(profiles.id, id)).get()
  return (row as Profile | undefined) ?? null
}

/**
 * Raise a child's high-water mark of known words.
 *
 * Only ever upwards: a caller that passes a smaller number than the one
 * on file is ignored rather than trusted, so no ordering of saves and no
 * stale tab can take a sticker back. The rise is written by the play
 * surface as it happens, which is also what seeds the mark for a profile
 * saved before the column existed.
 */
export function raiseBestKnown(db: Db, id: number, known: number): void {
  const row = db.select().from(profiles).where(eq(profiles.id, id)).get()
  if (!row) return
  if (known <= row.bestKnown) return
  db.update(profiles).set({ bestKnown: known }).where(eq(profiles.id, id)).run()
}

/** Deleting a child removes their progress too — nothing is left orphaned. */
export function deleteProfile(db: Db, id: number): void {
  db.delete(progress).where(eq(progress.profileId, id)).run()
  db.delete(profiles).where(eq(profiles.id, id)).run()
}
