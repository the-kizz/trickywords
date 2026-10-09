import type { Word } from './types'

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1, curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[n]
}

/**
 * 0 = completely different, 1 = identical.
 *
 * Edit distance is the base. A shared first letter adds weight because
 * beginning readers lean heavily on the initial grapheme, which makes
 * same-initial words genuinely harder to tell apart.
 */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase(), y = b.toLowerCase()
  if (x === y) return 1
  const base = 1 - levenshtein(x, y) / Math.max(x.length, y.length)
  const sharedInitial = x[0] === y[0] ? 0.15 : 0
  return Math.min(1, Math.max(0, base * 0.85 + sharedInitial))
}

/**
 * Rank candidates by orthographic similarity to target, most similar first.
 * Excludes the target word itself.
 *
 * Tiebreaker: when two candidates have equal similarity, prefer the one closest
 * in length to the target. Same-length words are genuinely harder for beginning
 * readers to tell apart (e.g., 'then' vs 'them'), so ranking them higher as
 * distractors reflects the difficulty hierarchy. Secondary tiebreaker: alphabetical.
 */
export function rankBySimilarity(target: string, candidates: Word[]): Word[] {
  const lenGap = (t: string) => Math.abs(t.length - target.length)
  return candidates
    .filter((c) => c.text.toLowerCase() !== target.toLowerCase())
    .map((c) => ({ c, s: similarity(target, c.text) }))
    .sort((p, q) =>
      q.s - p.s ||
      lenGap(p.c.text) - lenGap(q.c.text) ||
      p.c.text.localeCompare(q.c.text))
    .map(({ c }) => c)
}
