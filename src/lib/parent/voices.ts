import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Parent-recorded voice clips, one per word, stored in the data volume
 * and served back to override the bundled synthetic clip. A familiar
 * voice is better for a child than any synthetic one.
 */

const EXT = 'webm'

// Word ids are lowercase word text (see `src/lib/words/default-sets.ts`
// and a custom set edited by a parent) -- letters, digits and hyphens
// only. Rejecting anything else keeps a crafted id from writing outside
// the voices directory.
const SAFE_ID = /^[a-z0-9-]{1,64}$/

export function isSafeWordId(id: string): boolean {
  return SAFE_ID.test(id)
}

function voicesDir(): string {
  return path.join(process.env.TRICKYWORDS_DATA_DIR ?? './data', 'voices')
}

function voicePath(wordId: string): string {
  return path.join(voicesDir(), `${wordId}.${EXT}`)
}

export async function readVoice(wordId: string): Promise<Buffer | null> {
  if (!isSafeWordId(wordId)) return null
  try {
    return await fs.readFile(voicePath(wordId))
  } catch {
    return null
  }
}

export async function saveVoice(wordId: string, data: Buffer): Promise<void> {
  if (!isSafeWordId(wordId)) throw new Error('Invalid word id')
  await fs.mkdir(voicesDir(), { recursive: true })
  await fs.writeFile(voicePath(wordId), data)
}

export async function deleteVoice(wordId: string): Promise<void> {
  if (!isSafeWordId(wordId)) return
  await fs.rm(voicePath(wordId), { force: true })
}

/** Word ids that currently have a parent-recorded clip saved. */
export async function listVoiceIds(): Promise<string[]> {
  try {
    const files = await fs.readdir(voicesDir())
    return files
      .filter((f) => f.endsWith(`.${EXT}`))
      .map((f) => f.slice(0, -(EXT.length + 1)))
  } catch {
    return []
  }
}
