/** Small seeded PRNG (mulberry32), so a failing case can be replayed by seed. */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]
export const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
