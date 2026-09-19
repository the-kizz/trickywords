import type { Word } from '@/lib/words/types'
import { rankBySimilarity, similarity } from '@/lib/words/similarity'
import type { SupportLevel } from './support'

/**
 * Choose distractors matched to the support level.
 *
 * The errorless end deliberately picks words that look nothing like the
 * target, so a child who has barely met the word can still succeed. The
 * hard end picks genuine near-misses (them/then, where/were), which is
 * where real discrimination is learned.
 *
 * Falls back to whatever the pool can offer rather than returning short —
 * a game must always be playable.
 */
export function pickDistractors(
  target: Word,
  pool: Word[],
  support: SupportLevel,
  rng: () => number = Math.random,
): Word[] {
  const need = Math.max(0, support.choices - 1)
  if (need === 0) return []

  const ranked = rankBySimilarity(target.text, pool)
  if (ranked.length <= need) return ranked

  const differentInitial = (w: Word) =>
    w.text[0].toLowerCase() !== target.text[0].toLowerCase()

  let candidates: Word[]
  switch (support.similarity) {
    case 'far':
      candidates = [...ranked].reverse().filter(differentInitial)
      break
    case 'different-initial':
      candidates = ranked.filter(differentInitial).reverse()
      break
    case 'shared-letter':
      candidates = ranked.filter(
        (w) => similarity(target.text, w.text) >= 0.2 && differentInitial(w),
      )
      break
    case 'near':
      candidates = ranked
      break
  }

  if (candidates.length < need) {
    const seen = new Set(candidates.map((w) => w.id))
    candidates = [...candidates, ...ranked.filter((w) => !seen.has(w.id))]
  }

  // Take a deterministic window from the front of the candidate list so
  // repeated rounds do not always show the identical distractors.
  const window = Math.min(candidates.length, need + 3)
  const offset = Math.floor(rng() * Math.max(1, window - need + 1))
  return candidates.slice(offset, offset + need)
}
