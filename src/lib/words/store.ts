import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { wordSetSchema, type WordSet } from './types'
import { DEFAULT_SETS } from './default-sets'

const wordSetsFileSchema = z.array(wordSetSchema).min(1)

// Read lazily rather than cached at module scope, so it can be pointed
// at a fresh directory per test (and, in principle, changed without a
// process restart).
function dataDir(): string {
  return process.env.TRICKYWORDS_DATA_DIR ?? './data'
}

function wordSetsPath(): string {
  return path.join(dataDir(), 'word-sets.json')
}

/**
 * The word sets a parent has edited, read from the data volume.
 *
 * `data/word-sets.json` starts out absent -- every install begins on
 * the bundled defaults (the sequence a school typically sends home),
 * and only exists once a parent has actually edited something. Any
 * read failure (missing file, corrupt JSON, a shape that fails
 * validation) falls back to the bundled defaults rather than breaking
 * the app -- a family's saved edits should never be able to brick play.
 */
export async function loadWordSets(): Promise<WordSet[]> {
  try {
    const raw = await fs.readFile(wordSetsPath(), 'utf-8')
    return wordSetsFileSchema.parse(JSON.parse(raw))
  } catch {
    return DEFAULT_SETS
  }
}

export async function saveWordSets(sets: WordSet[]): Promise<void> {
  const parsed = wordSetsFileSchema.parse(sets)
  await fs.mkdir(dataDir(), { recursive: true })
  await fs.writeFile(wordSetsPath(), JSON.stringify(parsed, null, 2), 'utf-8')
}
