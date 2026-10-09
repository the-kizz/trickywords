import { describe, it, expect } from 'vitest'
import {
  buildRound, closingWord, MAX_NEW_WORDS_CREDITED, MAX_REVIEW_FROM_OTHER_SETS, planSession,
  refreshRound, sessionPool, sessionQueue, SESSION_LENGTH,
} from '@/lib/engine/session'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

const WORDS = DEFAULT_SETS.slice(0, 3).flatMap((s) => s.words) // 17 words
const rng = () => 0.5

function progressWhere(overrides: Record<string, Partial<WordProgress>>) {
  const m = new Map<string, WordProgress>()
  for (const w of WORDS) m.set(w.id, newProgress(w.id))
  for (const [id, o] of Object.entries(overrides)) {
    m.set(id, { ...m.get(id)!, ...o })
  }
  return m
}

describe('one queue: due words oldest first, then the island\'s new ones', () => {
  /** Every word met and due, so the queue is pure review. */
  const allDue = () => {
    const m = new Map<string, WordProgress>()
    for (const w of WORDS) m.set(w.id, { ...newProgress(w.id), box: 3, dueInSessions: 0 })
    return m
  }

  it('never runs longer than a session', () => {
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    expect(rounds).toHaveLength(SESSION_LENGTH)
    expect(SESSION_LENGTH).toBe(9)
  })

  /**
   * Every round but the last: the last one is the closing repeat, which
   * is appended on purpose and asks again for a word the session has
   * already gone well on -- see `planSession`.
   */
  it('asks for every word at most once, outside the closing repeat', () => {
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    const content = rounds.slice(0, -1).map((r) => r.word.id)
    expect(new Set(content).size).toBe(content.length)
  })

  /**
   * The defect this replaced: the closing round used to *overwrite* the
   * last planned round, so the last queued word was never asked. On a
   * fresh island that was one of three new words -- "This time: I, the,
   * my" asked I, the, I.
   */
  it('asks for every word it queued, closing round or not', () => {
    const { words: queue } = sessionQueue({ words: WORDS, progress: allDue() })
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    const asked = new Set(rounds.map((r) => r.word.id))
    for (const w of rounds.slice(0, -1)) expect(asked.has(w.word.id)).toBe(true)
    // Nine rounds still, of which eight are content and one closes.
    expect(rounds).toHaveLength(SESSION_LENGTH)
    expect(queue.length).toBeGreaterThanOrEqual(rounds.length - 1)
  })

  it('never introduces a word in the closing round that was not asked', () => {
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    const content = new Set(rounds.slice(0, -1).map((r) => r.word.id))
    // At plan time it is a placeholder drawn from the content; at play
    // time `SessionRunner` replaces it, also from words already asked.
    expect(content.has(rounds[rounds.length - 1].word.id)).toBe(true)
  })

  /**
   * "Oldest first" is what `dueInSessions` going negative is for: a word
   * that has been due for six sessions sorts ahead of one that came due
   * this session.
   */
  it('takes the most overdue words first', () => {
    const progress = allDue()
    progress.set('said', { ...progress.get('said')!, dueInSessions: -7 })
    progress.set('are', { ...progress.get('are')!, dueInSessions: -3 })
    const { rounds } = planSession({ words: WORDS, progress, rng })
    expect(rounds[0].word.id).toBe('said')
    expect(rounds[1].word.id).toBe('are')
  })

  it('leaves out a met word that is not due yet', () => {
    const progress = allDue()
    for (const w of WORDS.slice(3)) {
      progress.set(w.id, { ...progress.get(w.id)!, dueInSessions: 8 })
    }
    const { rounds } = planSession({ words: WORDS, progress, rng })
    const asked = new Set(rounds.map((r) => r.word.id))
    for (const w of WORDS.slice(3)) expect(asked.has(w.id)).toBe(false)
  })

  /**
   * Three was a coverage cap and is now a credit cap: the island is
   * shown whole and at most three of its first meetings may count. See
   * `MAX_NEW_WORDS_CREDITED` and `tests/unit/engine/island-coverage.test.ts`.
   */
  it('credits at most three first meetings in one sitting', () => {
    const island = DEFAULT_SETS.find((s) => s.id === 3)! // seven words
    const islandIds = new Set(island.words.map((w) => w.id))
    const { rounds, uncreditedNew } = planSession({
      words: island.words, islandIds, progress: new Map(), rng,
    })
    // Every word shown, and all but three of them uncredited.
    expect(new Set(rounds.map((r) => r.word.id))).toEqual(islandIds)
    expect(island.words.length - uncreditedNew.size).toBe(MAX_NEW_WORDS_CREDITED)
  })

  it('puts the review before the new words', () => {
    const progress = new Map<string, WordProgress>()
    for (const w of WORDS.slice(0, 2)) {
      progress.set(w.id, { ...newProgress(w.id), box: 2, dueInSessions: 0 })
    }
    const { rounds } = planSession({ words: WORDS, progress, rng })
    // Every round but the closing repeat, which may well repeat one of
    // the two met words -- it is chosen for strength, not for novelty.
    const ids = rounds.slice(0, -1).map((r) => r.word.id)
    expect(ids.slice(0, 2)).toEqual(WORDS.slice(0, 2).map((w) => w.id))
    // And the rest of the sitting is first meetings, not more review.
    const met = new Set(progress.keys())
    expect(ids.slice(2).some((id) => met.has(id))).toBe(false)
  })

  it('marks only the last round as final', () => {
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    expect(rounds.filter((r) => r.isFinal)).toHaveLength(1)
    expect(rounds[rounds.length - 1].isFinal).toBe(true)
  })

  it('gives every round distractors matching its support level', () => {
    const { rounds } = planSession({ words: WORDS, progress: allDue(), rng })
    for (const r of rounds) {
      expect(r.distractors).toHaveLength(r.support.choices - 1)
      expect(r.distractors.map((d) => d.id)).not.toContain(r.word.id)
    }
  })

  it('returns no rounds when there are no words', () => {
    expect(planSession({ words: [], progress: new Map(), rng }).rounds).toEqual([])
  })

  it('is deterministic for a given rng', () => {
    const a = planSession({ words: WORDS, progress: allDue(), rng })
    const b = planSession({ words: WORDS, progress: allDue(), rng })
    expect(a.rounds.map((r) => r.word.id)).toEqual(b.rounds.map((r) => r.word.id))
  })
})

/**
 * A session is as long as there is work to do, and nothing announces
 * that beforehand any more. The plan used to carry a `short` flag, which
 * the map turned into "Nothing much is due today" -- false in both
 * directions, and about a schedule that is not counted in days.
 */
describe('a session runs as long as there is work', () => {
  it('runs one round when one word is due and nothing is new', () => {
    const progress = new Map<string, WordProgress>()
    for (const w of WORDS) {
      progress.set(w.id, { ...newProgress(w.id), box: 3, dueInSessions: 4 })
    }
    progress.set(WORDS[0].id, { ...progress.get(WORDS[0].id)!, dueInSessions: 0 })
    expect(planSession({ words: WORDS, progress, rng }).rounds).toHaveLength(1)
  })

  /**
   * A second go the same day: nothing due, nothing new. They still gets
   * their island's words to practise -- practice is free, and the day
   * floor in `recordCorrect` is what stops it promoting anything.
   */
  it('still gives them something to play when nothing at all is due', () => {
    const progress = new Map<string, WordProgress>()
    for (const w of WORDS) {
      progress.set(w.id, { ...newProgress(w.id), box: 4, dueInSessions: 8 })
    }
    expect(planSession({ words: WORDS, progress, rng }).rounds.length).toBeGreaterThan(0)
  })
})

describe('sessionPool', () => {
  it('is the met words then the island\'s, each once', () => {
    const island = DEFAULT_SETS[1].words
    const met = DEFAULT_SETS[0].words
    const pool = sessionPool(island, met)
    expect(pool.map((w) => w.id)).toEqual([...met, ...island].map((w) => w.id))
  })

  it('never repeats a word that is both met and on the island', () => {
    const island = DEFAULT_SETS[0].words
    const pool = sessionPool(island, island)
    expect(pool.map((w) => w.id)).toEqual(island.map((w) => w.id))
  })
})

/**
 * A round's support used to be decided when the session was planned,
 * from a snapshot taken before the child had answered anything. So a
 * word's second appearance in a session was still planned at the box it
 * started at: session one on a new set was two copy-matches per word,
 * both recorded as unaided, and every word ended it at box 2 without a
 * single retrieval.
 */
describe('support derived when the round starts, not when it was planned', () => {
  const words = WORDS
  const roundFor = (id: string, progress: Map<string, WordProgress>) =>
    buildRound({
      word: words.find((w) => w.id === id)!, words, progress, isFinal: false, rng,
    })
  const planned = () => roundFor('i', progressWhere({}))

  it('gets harder for a word promoted earlier in the same session', () => {
    const round = planned()
    expect(round.support.showWordBeforeRound).toBe(true)

    const promoted = progressWhere({})
    promoted.set(round.word.id, recordCorrect(promoted.get(round.word.id)!, false))
    const live = refreshRound(round, words, promoted, rng)

    expect(live.word.id).toBe(round.word.id)
    expect(live.support.showWordBeforeRound).toBe(false)
    expect(live.support.choices).toBeGreaterThan(round.support.choices)
    expect(live.distractors.length).toBe(live.support.choices - 1)
  })

  it('gets easier straight away for a word that slipped', () => {
    const progress = progressWhere({ the: { box: 4, stage: 'reviewing' } })
    const round = roundFor('the', progress)
    expect(round.support.showWordBeforeRound).toBe(false)

    const slipped = progressWhere({
      the: { box: 4, stage: 'reviewing', struggling: true, lapses: 3 },
    })
    expect(refreshRound(round, words, slipped, rng).support.showWordBeforeRound).toBe(true)
  })

  it('keeps the planned round untouched when the support has not moved', () => {
    const round = planned()
    expect(refreshRound(round, words, progressWhere({}), rng)).toBe(round)
  })

  it('keeps the closing round closing', () => {
    const { rounds } = planSession({ words, progress: progressWhere({}), rng })
    const final = rounds[rounds.length - 1]
    const promoted = progressWhere({})
    promoted.set(final.word.id, recordCorrect(promoted.get(final.word.id)!, false))
    expect(refreshRound(final, words, promoted, rng).isFinal).toBe(true)
  })
})

/**
 * A session must never ask the same word twice running. That is where a
 * guessing child got a free ride -- the answer was on screen a second
 * ago -- and where an ordinary one got bored. A short session is better
 * than one padded with repeats.
 */
describe('never the same word twice running', () => {
  const consecutive = (rounds: { word: { id: string } }[]) =>
    rounds.filter((r, i) => i > 0 && r.word.id === rounds[i - 1].word.id)

  it('never repeats a word in the very next round', () => {
    const { rounds } = planSession({ words: WORDS, progress: progressWhere({}), rng })
    expect(consecutive(rounds)).toEqual([])
  })

  it('runs a shorter session rather than padding it with repeats', () => {
    const only = [WORDS[0]]
    const { rounds } = planSession({
      words: only, progress: progressWhere({}), rng, length: 9,
    })
    expect(consecutive(rounds)).toEqual([])
    expect(rounds.length).toBeLessThan(9)
    expect(rounds.length).toBeGreaterThan(0)
  })

  it('holds for a small pool, whatever the requested length', () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const { rounds } = planSession({
        words: WORDS.slice(0, size), progress: progressWhere({}), rng, length: 9,
      })
      expect(consecutive(rounds), `pool of ${size}`).toEqual([])
    }
  })

  it('still ends on a round marked final', () => {
    const { rounds } = planSession({
      words: [WORDS[0], WORDS[1]], progress: progressWhere({}), rng, length: 9,
    })
    expect(rounds.at(-1)!.isFinal).toBe(true)
    expect(rounds.filter((r) => r.isFinal)).toHaveLength(1)
  })
})

/**
 * The app promises every session ends on a success and used to only
 * plan to: the closing word was the strongest word at plan time, and one
 * measured sitting therefore ended on the word the child had missed in
 * round 8.
 */
describe('the word a session ends on', () => {
  const words = WORDS.slice(0, 5)
  const strong = progressWhere({
    [words[0].id]: { box: 5, stage: 'known' },
    [words[1].id]: { box: 4, stage: 'reviewing' },
    [words[2].id]: { box: 3, stage: 'reviewing' },
  })

  const choose = (o: Partial<Parameters<typeof closingWord>[0]> = {}) => closingWord({
    words,
    progress: strong,
    answeredWell: new Set<string>(),
    missed: new Set<string>(),
    fallback: words[4],
    ...o,
  })

  it('is the strongest word the child has actually answered well', () => {
    expect(choose({ answeredWell: new Set([words[1].id, words[2].id]) }).id)
      .toBe(words[1].id)
  })

  it('passes over a word they missed this session, however strong it is', () => {
    const chosen = choose({
      answeredWell: new Set([words[0].id, words[1].id]),
      missed: new Set([words[0].id]),
    })
    expect(chosen.id).toBe(words[1].id)
  })

  it('never asks for the word that was just played', () => {
    expect(choose({
      answeredWell: new Set([words[0].id, words[1].id]),
      justPlayed: words[0].id,
    }).id).toBe(words[1].id)
  })

  it('falls back to the strongest word when nothing has gone well yet', () => {
    expect(choose().id).toBe(words[0].id)
  })

  it('still returns a word when every candidate is ruled out', () => {
    expect(choose({ words: [], missed: new Set(words.map((w) => w.id)) }).id)
      .toBe(words[4].id)
  })

})

/**
 * Choosing an island is the main say a child has in this app. It stopped
 * meaning much: every met word that was due came before any new one, and
 * new words are capped, so tapping a fresh Set 6 with Set 7 already
 * learned produced five Set 7 rounds and three Set 6 ones. The operator
 * noticed immediately -- "When I do set 6, seems to be mainly set 7
 * words. Is there a reason?"
 */
describe('the island a child taps leads the session', () => {
  const set6 = DEFAULT_SETS.find((s) => s.id === 6)!
  const set7 = DEFAULT_SETS.find((s) => s.id === 7)!
  const islandIds = new Set(set6.words.map((w) => w.id))

  /** Set 7 learned and due for review; Set 6 never met. */
  function afterLearningSet7(): Map<string, WordProgress> {
    const progress = new Map<string, WordProgress>()
    for (const w of set7.words) {
      progress.set(w.id, { ...newProgress(w.id), box: 1, dueInSessions: 0 })
    }
    return progress
  }

  const pool = () => sessionPool(
    set6.words,
    DEFAULT_SETS.flatMap((s) => s.words).filter((w) => afterLearningSet7().has(w.id)),
  )

  const isOn = (set: typeof set6) => (w: { id: string }) =>
    set.words.some((x) => x.id === w.id)

  it('asks the tapped island first', () => {
    const { words } = sessionQueue({
      words: pool(), islandIds, progress: afterLearningSet7(),
    })
    expect(isOn(set6)(words[0])).toBe(true)
  })

  it('never lets other islands take more of the session than the cap', () => {
    const { words } = sessionQueue({
      words: pool(), islandIds, progress: afterLearningSet7(),
    })
    expect(words.filter(isOn(set7))).toHaveLength(MAX_REVIEW_FROM_OTHER_SETS)
  })

  it('still reviews other islands -- capped is not cut', () => {
    const { words } = sessionQueue({
      words: pool(), islandIds, progress: afterLearningSet7(),
    })
    expect(words.filter(isOn(set7)).length).toBeGreaterThan(0)
  })

  it('runs a shorter session rather than padding it from elsewhere', () => {
    const { words } = sessionQueue({
      words: pool(), islandIds, progress: afterLearningSet7(),
    })
    expect(words.length).toBeLessThan(SESSION_LENGTH)
  })

  it('treats every word as the island when no island is named', () => {
    const { words } = sessionQueue({ words: pool(), progress: afterLearningSet7() })
    expect(words.filter(isOn(set7)).length).toBeGreaterThan(MAX_REVIEW_FROM_OTHER_SETS)
  })
})

/**
 * The path most real sittings took, and the one place the island was
 * still ignored entirely: nothing due, nothing new, so the queue fell
 * back to *all* met words weakest-first. Measured, tapping a
 * fully-known Set 1 gave `all ball call little tall a i is my` -- five
 * of the nine from Set 7, on the island they chose to play.
 */
describe('a second go the same day stays on the island they tapped', () => {
  const set1 = DEFAULT_SETS[0]
  const set7 = DEFAULT_SETS.find((s) => s.id === 7)!
  const islandIds = new Set(set1.words.map((w) => w.id))

  /** Everything met, at the top box, and nothing due for a while. */
  function nothingDue(): Map<string, WordProgress> {
    const progress = new Map<string, WordProgress>()
    for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
      progress.set(w.id, {
        ...newProgress(w.id), box: 5, stage: 'known', dueInSessions: 8,
      })
    }
    // A pair of Set 7 words weaker than anything on Set 1, so a
    // weakest-first fallback that ignored the island would put them
    // first.
    for (const w of set7.words.slice(0, 2)) {
      progress.set(w.id, { ...newProgress(w.id), box: 1, dueInSessions: 8 })
    }
    return progress
  }

  const pool = () => sessionPool(set1.words, DEFAULT_SETS.flatMap((s) => s.words))

  it('gives them the island\'s own words to practise', () => {
    const { words } = sessionQueue({ words: pool(), islandIds, progress: nothingDue() })
    expect(words.map((w) => w.id).sort()).toEqual(set1.words.map((w) => w.id).sort())
  })

  it('takes nothing from another island, however weak it is', () => {
    const { words } = sessionQueue({ words: pool(), islandIds, progress: nothingDue() })
    expect(words.some((w) => set7.words.some((x) => x.id === w.id))).toBe(false)
  })

  it('orders the island\'s own words weakest first', () => {
    const progress = nothingDue()
    progress.set(set1.words[3].id, {
      ...newProgress(set1.words[3].id), box: 1, dueInSessions: 8,
    })
    const { words } = sessionQueue({ words: pool(), islandIds, progress })
    expect(words[0].id).toBe(set1.words[3].id)
  })

  /** Only an island with no words at all makes it look wider. */
  it('looks wider only when the island it was given is empty', () => {
    const { words } = sessionQueue({
      words: pool(), islandIds: new Set<string>(), progress: nothingDue(),
    })
    expect(words.length).toBeGreaterThan(0)
    expect(words.some((w) => set7.words.some((x) => x.id === w.id))).toBe(true)
  })
})
