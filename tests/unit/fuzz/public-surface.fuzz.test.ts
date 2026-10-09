import { describe, it, expect } from 'vitest'
import { isPubliclyAllowed, normalisePublicPath, publicRedirectLocation } from '@/lib/public-surface.mts'
import { prng, pick, int } from './prng'

/** Paths that must never reach the app from the public listener. */
const FORBIDDEN = ['/parent', '/api/progress', '/api/profiles', '/api/words', '/play/1', '/api/voices', '/_next/data']
const PIECES = ['/', '..', '.', '%2e%2e', '%2f', '%252e', '\\', 'play', 'parent', 'api', 'progress', 'profiles', 'og', 'audio', 'words', '%00', '\u0000', '%c0%ae', ';', '?', '#', '//', '%2F', 'PLAY', 'Parent', ' ', '%20', 'ðŸ’¥', '%e2%80%ae']

describe('the public allowlist under random paths', () => {
  it('never throws and never lets a forbidden path through', () => {
    for (let seed = 1; seed <= 5000; seed++) {
      const rng = prng(seed)
      const path = Array.from({ length: int(rng, 1, 8) }, () => pick(rng, PIECES)).join(rng() < 0.5 ? '' : '/')
      const where = `seed ${seed}: ${JSON.stringify(path)}`
      let allowed = false
      expect(() => { allowed = isPubliclyAllowed(path) }, where).not.toThrow()
      expect(() => normalisePublicPath(path), where).not.toThrow()
      expect(() => publicRedirectLocation(path), where).not.toThrow()
      if (allowed) {
        const norm = normalisePublicPath(path)
        expect(norm, `${where}: allowed but unnormalisable`).not.toBeNull()
        for (const bad of FORBIDDEN) {
          expect(norm === bad || norm!.startsWith(bad + '/'), `${where}: normalised to ${norm}, which is forbidden`).toBe(false)
        }
        expect(norm!.includes('..'), `${where}: traversal survived as ${norm}`).toBe(false)
      }
    }
  })
})
