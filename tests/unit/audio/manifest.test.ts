import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { wordAudioUrl, phraseAudioUrl, PHRASES } from '@/lib/audio/manifest'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

describe('audio manifest', () => {
  it('maps a word to a local ogg path, never an external URL', () => {
    expect(wordAudioUrl('said')).toBe('/audio/words/said.ogg')
    expect(wordAudioUrl('said')).not.toMatch(/^https?:/)
  })

  it('maps every default word to a url', () => {
    for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
      expect(wordAudioUrl(w.audioId)).toMatch(/^\/audio\/words\/.+\.ogg$/)
    }
  })

  it('provides spoken instructions for pre-readers', () => {
    for (const k of ['findTheWord', 'tryAgain', 'wellDone']) {
      expect(PHRASES).toHaveProperty(k)
    }
  })

  it('never tells a child they got something wrong', () => {
    const all = Object.values(PHRASES).join(' ').toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'failed', 'bad']) {
      expect(all).not.toContain(banned)
    }
  })

  it('maps a phrase key to a local path', () => {
    expect(phraseAudioUrl('wellDone')).toBe('/audio/phrases/wellDone.ogg')
  })

  /**
   * A phrase with no clip behind it is a silent instruction, which for a
   * pre-reader is no instruction at all. Cheap to assert, and it is how
   * a hand-added key without its audio gets caught.
   */
  it('ships a committed clip for every phrase', () => {
    for (const key of Object.keys(PHRASES) as Array<keyof typeof PHRASES>) {
      const url = phraseAudioUrl(key)
      expect(existsSync(path.join(process.cwd(), 'public', url)), url).toBe(true)
    }
  })

  /** The way out of a running session, which had no voice at all. */
  it('speaks the way out of a session', () => {
    expect(PHRASES.goBack).toBe('Go back')
    expect(phraseAudioUrl('goBack')).toBe('/audio/phrases/goBack.ogg')
  })

  /**
   * Every surviving phrase is spoken by something. A key with nothing
   * behind it is dead weight a future reader has to reason about, and
   * eleven of them went with the five games this wave cut.
   */
  it('keeps no phrase the app no longer says', () => {
    for (const gone of [
      'pickAGame', 'gameSurpriseMe', 'gameTreasureHunt', 'swatTheWord',
      'findThePair', 'coverTheWord', 'findItInTheSentence', 'keepLooking',
      'listen', 'yourTurn',
    ]) {
      expect(PHRASES).not.toHaveProperty(gone)
    }
  })
})
