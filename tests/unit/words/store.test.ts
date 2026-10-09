import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordSet } from '@/lib/words/types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'trickywords-sets-'))
  process.env.TRICKYWORDS_DATA_DIR = dir
})

afterEach(() => {
  delete process.env.TRICKYWORDS_DATA_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('word set store', () => {
  it('falls back to the bundled defaults when no file has been saved', async () => {
    const { loadWordSets } = await import('@/lib/words/store')
    expect(await loadWordSets()).toEqual(DEFAULT_SETS)
  })

  it('round-trips edited sets to the data volume', async () => {
    const { loadWordSets, saveWordSets } = await import('@/lib/words/store')
    const edited: WordSet[] = [
      { id: 1, name: 'Set 1', words: [DEFAULT_SETS[0].words[0]] },
    ]
    await saveWordSets(edited)
    expect(await loadWordSets()).toEqual(edited)
  })

  it('falls back to defaults if the saved file is corrupt', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'word-sets.json'), '{ not json', 'utf-8')
    const { loadWordSets } = await import('@/lib/words/store')
    expect(await loadWordSets()).toEqual(DEFAULT_SETS)
  })
})
