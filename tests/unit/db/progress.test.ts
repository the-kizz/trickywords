import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, type Db } from '@/lib/db/client'
import { createProfile, deleteProfile } from '@/lib/db/profiles'
import { loadProgress, saveProgress, getSetting, setSetting } from '@/lib/db/progress'
import { newProgress, recordCorrect, recordMiss, recordSaidIt } from '@/lib/engine/ladder'

let db: Db
let profileId: number

beforeEach(() => {
  db = getDb(':memory:')
  profileId = createProfile(db, { name: 'Robin', avatar: 'fox' }).id
})

describe('progress persistence', () => {
  it('returns an empty map for a fresh profile', () => {
    expect(loadProgress(db, profileId).size).toBe(0)
  })

  it('round-trips a word progress record exactly', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveProgress(db, profileId, p)
    expect(loadProgress(db, profileId).get('said')).toEqual(p)
  })

  it('updates rather than duplicating on repeat saves', () => {
    let p = newProgress('said')
    saveProgress(db, profileId, p)
    p = recordCorrect(p, false)
    saveProgress(db, profileId, p)
    const loaded = loadProgress(db, profileId)
    expect(loaded.size).toBe(1)
    expect(loaded.get('said')!.box).toBe(1)
  })

  it('preserves the struggling flag across a round trip', () => {
    saveProgress(db, profileId, { ...newProgress('where'), struggling: true })
    expect(loadProgress(db, profileId).get('where')!.struggling).toBe(true)
  })

  it('keeps each child progress separate', () => {
    const other = createProfile(db, { name: 'Sam', avatar: 'owl' }).id
    saveProgress(db, profileId, recordCorrect(newProgress('said'), false))
    expect(loadProgress(db, other).size).toBe(0)
  })

  it('removes a child progress when the profile is deleted', () => {
    saveProgress(db, profileId, newProgress('said'))
    deleteProfile(db, profileId)
    expect(loadProgress(db, profileId).size).toBe(0)
  })
})

describe('settings', () => {
  it('returns null for a missing key', () => {
    expect(getSetting(db, 'pin')).toBeNull()
  })

  it('round-trips and overwrites a setting', () => {
    setSetting(db, 'pin', 'hash-a')
    expect(getSetting(db, 'pin')).toBe('hash-a')
    setSetting(db, 'pin', 'hash-b')
    expect(getSetting(db, 'pin')).toBe('hash-b')
  })
})

/**
 * The say-it count survives a round trip, and appears on a database
 * written before the column existed -- a family upgrades this app by
 * pulling an image, with nobody to run a migration tool.
 */
describe('reading a word out loud', () => {
  it('stores and reloads the count', () => {
    const p = recordSaidIt(recordSaidIt(newProgress('said')))
    saveProgress(db, profileId, p)
    expect(loadProgress(db, profileId).get('said')!.saidIt).toBe(2)
  })

  it('starts at nothing for a word that has never been read out', () => {
    saveProgress(db, profileId, newProgress('where'))
    expect(loadProgress(db, profileId).get('where')!.saidIt).toBe(0)
  })
})

/**
 * The day a word was last promoted on survives a round trip, and is
 * absent rather than wrong on a database written before the column
 * existed -- a family upgrades this app by pulling an image, with nobody
 * to run a migration tool. Absent reads as "never credited", which
 * credits the next correct answer: the safe direction.
 */
describe('the day floor on the way to disk and back', () => {
  it('stores and reloads the day a word was credited', () => {
    const p = recordCorrect(newProgress('said'), false, '2026-09-14')
    saveProgress(db, profileId, p)
    expect(loadProgress(db, profileId).get('said')!.lastCreditedOn).toBe('2026-09-14')
  })

  it('is null for a word that has never been promoted', () => {
    saveProgress(db, profileId, newProgress('where'))
    expect(loadProgress(db, profileId).get('where')!.lastCreditedOn).toBeNull()
  })

  it('is cleared again by a miss, so a slip can be won back today', () => {
    const credited = recordCorrect(newProgress('said'), false, '2026-09-14')
    saveProgress(db, profileId, recordMiss(credited))
    expect(loadProgress(db, profileId).get('said')!.lastCreditedOn).toBeNull()
  })
})
