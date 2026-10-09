/**
 * Seeds a demo family database for E2E testing (and for anyone poking
 * at the app locally in family mode without wanting to hand-create
 * profiles first).
 *
 * Creates two invented profiles -- Robin and Sam -- with the PIN gate
 * set to 1234, and gives Robin some real progress: Sets 1-2 mostly
 * `known`, plus one word (`where`, from Set 10) flagged `struggling`,
 * so the parent view and the games' review flow both have something
 * genuine to show rather than an empty database.
 *
 * Run with: npx tsx scripts/seed-demo.ts
 * Reads TRICKYWORDS_DB same as the app itself (defaults to
 * ./data/demo.db here so it never collides with a real family's
 * database at the default path).
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { createProfile } from '../src/lib/db/profiles'
import { saveProgress, setSetting } from '../src/lib/db/progress'
import { hashPin } from '../src/lib/parent/pin'
import { DEFAULT_SETS } from '../src/lib/words/default-sets'
import { BOX_INTERVALS, MAX_BOX } from '../src/lib/engine/ladder'
import type { WordProgress } from '../src/lib/engine/types'

const DB_PATH = process.env.TRICKYWORDS_DB ?? './data/demo.db'
const DEMO_PIN = '1234'

function known(wordId: string): WordProgress {
  return {
    wordId, stage: 'known', box: MAX_BOX, dueInSessions: BOX_INTERVALS[MAX_BOX],
    correctStreak: MAX_BOX, attempts: MAX_BOX, lapses: 0, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
  }
}

function reviewing(wordId: string): WordProgress {
  return {
    wordId, stage: 'reviewing', box: 2, dueInSessions: BOX_INTERVALS[2],
    correctStreak: 2, attempts: 3, lapses: 1, struggling: false, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
  }
}

function struggling(wordId: string): WordProgress {
  return {
    wordId, stage: 'learning', box: 0, dueInSessions: 0,
    correctStreak: 0, attempts: 3, lapses: 2, struggling: true, saidIt: 0, readToAdult: 0, lastCreditedOn: null,
  }
}

function main() {
  // Start clean every run -- a re-seed must never accumulate duplicate
  // profiles or stale WAL files from a previous run.
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${DB_PATH}${suffix}`
    if (existsSync(p)) rmSync(p)
  }

  const db = getDb(DB_PATH)

  // Two of the eight delivered avatars. An id this app does not know --
  // one of the old generated ids, say -- still renders the fallback face
  // rather than a broken image; that behaviour is deliberate and tested,
  // but a demo profile should show the real artwork.
  const robin = createProfile(db, { name: 'Robin', avatar: 'fox' })
  createProfile(db, { name: 'Sam', avatar: 'panda' })

  setSetting(db, 'pinHash', hashPin(DEMO_PIN))

  const set1 = DEFAULT_SETS[0].words // I, the, my, a, is
  const set2 = DEFAULT_SETS[1].words // was, you, to, they, that

  // Set 1: fully known.
  for (const word of set1) saveProgress(db, robin.id, known(word.id))

  // Set 2: mostly known, one word still settling in -- "mostly", not
  // entirely, so the parent view shows a mix of states, not a wall of
  // green.
  for (const word of set2) {
    saveProgress(db, robin.id, word.id === 'that' ? reviewing(word.id) : known(word.id))
  }

  // A struggling word outside Sets 1-2, so the parent view has a real
  // "keeps slipping" note to show.
  saveProgress(db, robin.id, struggling('where'))

  console.log(`Seeded ${DB_PATH}`)
  console.log(`  Robin (id ${robin.id}): Set 1 known, Set 2 mostly known, 'where' struggling`)
  console.log(`  Sam: no progress yet`)
  console.log(`  PIN: ${DEMO_PIN}`)
}

main()
