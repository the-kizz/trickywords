import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { getDb, type Db } from '@/lib/db/client'
import {
  createProfile, listProfiles, deleteProfile, getProfile, raiseBestKnown,
} from '@/lib/db/profiles'

let db: Db
beforeEach(() => { db = getDb(':memory:') })

describe('profiles', () => {
  it('starts with no profiles', () => {
    expect(listProfiles(db)).toEqual([])
  })

  it('creates and lists a profile', () => {
    const p = createProfile(db, { name: 'Robin', avatar: 'fox' })
    expect(p.id).toBeGreaterThan(0)
    expect(listProfiles(db)[0]).toMatchObject({ name: 'Robin', avatar: 'fox' })
  })

  it('supports several children on one install', () => {
    createProfile(db, { name: 'Robin', avatar: 'fox' })
    createProfile(db, { name: 'Sam', avatar: 'owl' })
    expect(listProfiles(db)).toHaveLength(2)
  })

  it('deletes a profile', () => {
    const p = createProfile(db, { name: 'Alex', avatar: 'bee' })
    deleteProfile(db, p.id)
    expect(listProfiles(db)).toEqual([])
  })

  it('rejects an empty name', () => {
    expect(() => createProfile(db, { name: '  ', avatar: 'fox' })).toThrow()
  })
})

/**
 * The mark the companion and the sticker book are drawn from. It only
 * ever rises -- a child cannot lose a sticker by mis-tapping once.
 */
describe('the high-water mark of known words', () => {
  it('starts at nothing for a new child', () => {
    expect(createProfile(db, { name: 'Robin', avatar: 'fox' }).bestKnown).toBe(0)
  })

  it('rises when more words are known than ever before', () => {
    const p = createProfile(db, { name: 'Robin', avatar: 'fox' })
    raiseBestKnown(db, p.id, 6)
    expect(getProfile(db, p.id)?.bestKnown).toBe(6)
  })

  it('refuses to fall', () => {
    const p = createProfile(db, { name: 'Robin', avatar: 'fox' })
    raiseBestKnown(db, p.id, 6)
    raiseBestKnown(db, p.id, 2)
    expect(getProfile(db, p.id)?.bestKnown).toBe(6)
  })

  it('ignores a child who is not there', () => {
    expect(() => raiseBestKnown(db, 999, 3)).not.toThrow()
  })
})

/**
 * A family updates this app by pulling a new image, and there is nobody
 * to run a migration tool. A column added after the first release has to
 * appear in a database that already exists -- and the child whose
 * profile is in it must not lose their stickers to an upgrade.
 */
describe('upgrading a database written by an earlier version', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'trickywords-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('adds the high-water mark column to an existing profiles table', () => {
    const path = join(dir, 'old.db')
    const old = new Database(path)
    old.exec(`CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, avatar TEXT NOT NULL, created_at INTEGER NOT NULL
    )`)
    old.prepare('INSERT INTO profiles (name, avatar, created_at) VALUES (?, ?, ?)')
      .run('Robin', 'fox', 0)
    old.close()

    const upgraded = getDb(path)
    expect(listProfiles(upgraded)[0]).toMatchObject({ name: 'Robin', bestKnown: 0 })
    // Idempotent: opening it again must not try to add the column twice.
    expect(() => getDb(path)).not.toThrow()
  })
})
