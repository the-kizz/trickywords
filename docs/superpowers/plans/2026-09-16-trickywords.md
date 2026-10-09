# Tricky Words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted web app that teaches children aged 5–7 high-frequency "tricky words" through seven tap-only games driven by an errorless, expanding-interval progress engine, shipped as one multi-arch container that can run either as a private family install or as a public, data-free guest site.

**Architecture:** A single Next.js 16 app with a pure, I/O-free progress engine at its core (the most-tested unit), a thin Drizzle/SQLite persistence layer used only in family mode, and a `sessionStorage`-backed guest store used only in public mode. Mode is chosen by env var at boot and enforced structurally — in public mode the write routes and parent area are never registered and no data volume is mounted, so family data cannot leak rather than merely being guarded.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind 4, Motion, Drizzle ORM + better-sqlite3, Zod, Vitest, Playwright, Docker buildx.

**Spec:** `docs/superpowers/specs/2026-09-16-trickywords-design.md`

## Required Skills

Not optional; they apply across every task:

- **superpowers:test-driven-development** — every task writes the failing test first.
- **superpowers:systematic-debugging** — on any test failure or unexpected behaviour, before proposing a fix.
- **superpowers:verification-before-completion** — before claiming any task done.
- **superpowers:requesting-code-review** — before the final publish task.
- **ui-ux-pro-max** — supplied the design system (Claymorphism, palette, motion tier); re-run with `--domain ux` for any new interaction concern. Its pre-delivery checklist gates Task 23.
- **playwright-skill** — invoke it for the screenshot work in Task 23 rather than hand-rolling browser automation.

## Global Constraints

A task that violates one is not done.

- **Identity:** every commit authored `the-kizz <33205454+the-kizz@users.noreply.github.com>`, set at repo level. No real names, personal or work email addresses, employer names, hostnames, or other personal information in code, commits, metadata, tests, fixtures, or screenshots — ever.
- **Demo data only:** invented child names `Robin`, `Sam`, `Alex`; demo PIN `1234`.
- **Licence:** AGPL-3.0-or-later.
- **Touch targets:** every interactive element ≥ **76×76 CSS px** (NN/g 2cm for ages 5–7). Enforced via `MIN_TARGET_PX` and asserted in tests. No exceptions.
- **No drag:** no drag, swipe-to-move, pinch or long-press-drag anywhere. Tap only. Do not add `@dnd-kit` or equivalents.
- **No fail states:** no child-facing screen shows "wrong", a red cross, a losing timer, or a decreasing score.
- **No emoji as icons:** SVG only.
- **No network at runtime:** no CDN fonts, no external calls, no analytics, no telemetry. Fonts self-hosted in `public/fonts/`.
- **Accessibility floors:** text contrast ≥ 4.5:1, focus rings never removed, `prefers-reduced-motion` respected, every instruction has an audio equivalent.
- **Node 22 LTS. TypeScript strict, no `any` in committed code.**
- **The 12 default sets contain exactly 56 words.**
- **Every task ends with a commit**, message ending with the two attribution lines used on the spec commit.

---

## File Structure

```
src/
  lib/
    words/{types,default-sets,similarity}.ts
    engine/{types,ladder,support,strugglers,distractors,session,unlock}.ts
    db/{schema,client,profiles,progress}.ts
    guest/store.ts
    audio/{manifest,player}.ts
    parent/pin.ts
    mode.ts  rewards.ts  constants.ts
  components/
    clay/{Button,Card,WordTile}.tsx
    games/{ListenAndFind,HeartWordBuilder,WordSwat,MemoryPairs,Bingo,WordSpotter,TreasureHunt,types,index}.tsx
    companion/Companion.tsx  map/ProgressMap.tsx  stickers/StickerBook.tsx
    guest/GuestHome.tsx  SessionRunner.tsx
  app/{page.tsx,play/,parent/,api/}
  middleware.ts
scripts/{generate-audio.ts,seed-demo.ts}
tests/unit/  tests/e2e/  docker/
```

Each file has one responsibility. The engine files are pure functions with no I/O, which is what makes them cheap to test exhaustively.

---

## Task 1: Project scaffold and touch-target floor

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/lib/constants.ts`, `tests/unit/setup.ts`
- Test: `tests/unit/constants.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_TARGET_PX: number` (76), `APP_NAME: string` ("Tricky Words") from `@/lib/constants`. Every later task imports `MIN_TARGET_PX` rather than hardcoding 76.

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir \
  --import-alias "@/*" --no-eslint --use-npm --yes
npm i motion zod drizzle-orm better-sqlite3
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event \
  drizzle-kit @types/better-sqlite3 tsx
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

Create `tests/unit/setup.ts` containing `import '@testing-library/jest-dom/vitest'`.

Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.

Add to `.gitignore`: `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env*`, `test-results/`, `playwright-report/`.

- [ ] **Step 3: Write the failing test**

Create `tests/unit/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MIN_TARGET_PX, APP_NAME } from '@/lib/constants'

describe('constants', () => {
  it('sets the child touch target floor to 76px (NN/g 2cm)', () => {
    expect(MIN_TARGET_PX).toBe(76)
  })

  it('names the app', () => {
    expect(APP_NAME).toBe('Tricky Words')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- constants`
Expected: FAIL — cannot resolve `@/lib/constants`.

- [ ] **Step 5: Write minimal implementation**

Create `src/lib/constants.ts`:

```ts
/**
 * Minimum interactive target size in CSS px.
 *
 * Nielsen Norman Group recommends ~2cm x 2cm for children aged 5-7,
 * roughly four times the adult minimum, because fine motor control is
 * still developing. Never lower this.
 */
export const MIN_TARGET_PX = 76

export const APP_NAME = 'Tricky Words'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- constants`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with Vitest and touch-target floor"
```

---

## Task 2: Word types and the 56 default words

**Files:**
- Create: `src/lib/words/types.ts`, `src/lib/words/default-sets.ts`
- Test: `tests/unit/words/default-sets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Classification = 'heart' | 'decodable' | 'family'`
  - `interface Word { id: string; text: string; graphemes: string[]; phonemes: string[]; trickyIndices: number[]; classification: Classification; sentences: string[]; audioId: string }`
  - `interface WordSet { id: number; name: string; words: Word[] }`
  - `const DEFAULT_SETS: WordSet[]`, `wordSchema`, `wordSetSchema` (Zod)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/words/default-sets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { wordSetSchema } from '@/lib/words/types'

const ALL = () => DEFAULT_SETS.flatMap((s) => s.words)

describe('default word sets', () => {
  it('has 12 sets containing 56 words', () => {
    expect(DEFAULT_SETS).toHaveLength(12)
    expect(ALL()).toHaveLength(56)
  })

  it('every set validates against the schema', () => {
    for (const set of DEFAULT_SETS) {
      expect(() => wordSetSchema.parse(set)).not.toThrow()
    }
  })

  it('gives every word a segmentation that rebuilds the word', () => {
    for (const w of ALL()) {
      expect(w.graphemes.length).toBe(w.phonemes.length)
      expect(w.graphemes.join('')).toBe(w.text)
    }
  })

  it('marks tricky indices in range, and only on heart words', () => {
    for (const w of ALL()) {
      for (const i of w.trickyIndices) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(w.graphemes.length)
      }
      if (w.classification === 'heart') {
        expect(w.trickyIndices.length).toBeGreaterThan(0)
      } else {
        expect(w.trickyIndices).toEqual([])
      }
    }
  })

  it('is honest that this/then/go/so/no are decodable, not tricky', () => {
    const byText = new Map(ALL().map((w) => [w.text, w]))
    for (const t of ['this', 'then', 'go', 'so', 'no']) {
      expect(byText.get(t)?.classification).toBe('decodable')
    }
  })

  it('treats the all/call/ball/tall group as a spelling family', () => {
    const byText = new Map(ALL().map((w) => [w.text, w]))
    for (const t of ['all', 'call', 'ball', 'tall']) {
      expect(byText.get(t)?.classification).toBe('family')
    }
  })

  it('gives every word a sentence that contains it', () => {
    for (const w of ALL()) {
      expect(w.sentences.length).toBeGreaterThan(0)
      for (const s of w.sentences) {
        expect(s.toLowerCase()).toContain(w.text.toLowerCase())
      }
    }
  })

  it('gives every word a unique id and audioId', () => {
    const words = ALL()
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length)
    expect(new Set(words.map((w) => w.audioId)).size).toBe(words.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- default-sets`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types**

Create `src/lib/words/types.ts`:

```ts
import { z } from 'zod'

/**
 * heart     - mostly regular, with an irregular part to learn by heart
 * decodable - fully regular; frequent, but the child can sound it out
 * family    - regular member of a shared spelling pattern (all/call/ball)
 */
export const classificationSchema = z.enum(['heart', 'decodable', 'family'])
export type Classification = z.infer<typeof classificationSchema>

export const wordSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  graphemes: z.array(z.string().min(1)).min(1),
  phonemes: z.array(z.string().min(1)).min(1),
  trickyIndices: z.array(z.number().int().nonnegative()),
  classification: classificationSchema,
  sentences: z.array(z.string().min(1)).min(1),
  audioId: z.string().min(1),
})
export type Word = z.infer<typeof wordSchema>

export const wordSetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  words: z.array(wordSchema).min(1),
})
export type WordSet = z.infer<typeof wordSetSchema>
```

- [ ] **Step 4: Write the default sets**

Create `src/lib/words/default-sets.ts` with exactly this data — do not invent your own segmentation. A silent grapheme (the `e` in `have`, `like`, `some`) carries the placeholder phoneme `/_/` so the arrays stay parallel; Heart Word Builder renders it as a silent tile.

```ts
import type { Word, WordSet, Classification } from './types'

function w(
  text: string, graphemes: string[], phonemes: string[],
  trickyIndices: number[], classification: Classification, sentences: string[],
): Word {
  return {
    id: text.toLowerCase(), text, graphemes, phonemes,
    trickyIndices, classification, sentences, audioId: text.toLowerCase(),
  }
}

export const DEFAULT_SETS: WordSet[] = [
  { id: 1, name: 'Set 1', words: [
    w('I', ['I'], ['/ai/'], [0], 'heart', ['I can run.']),
    w('the', ['th','e'], ['/th/','/uh/'], [1], 'heart', ['The cat sat.']),
    w('my', ['m','y'], ['/m/','/ai/'], [1], 'heart', ['My dog is big.']),
    w('a', ['a'], ['/uh/'], [0], 'heart', ['A pig ran.']),
    w('is', ['i','s'], ['/i/','/z/'], [1], 'heart', ['It is hot.']),
  ]},
  { id: 2, name: 'Set 2', words: [
    w('was', ['w','a','s'], ['/w/','/o/','/z/'], [1,2], 'heart', ['It was fun.']),
    w('you', ['y','ou'], ['/y/','/oo/'], [1], 'heart', ['Can you run?']),
    w('to', ['t','o'], ['/t/','/oo/'], [1], 'heart', ['Run to me.']),
    w('they', ['th','ey'], ['/th/','/ay/'], [1], 'heart', ['They can hop.']),
    w('that', ['th','a','t'], ['/th/','/a/','/t/'], [], 'decodable', ['That is my hat.']),
  ]},
  { id: 3, name: 'Set 3', words: [
    w('said', ['s','ai','d'], ['/s/','/e/','/d/'], [1], 'heart', ['Mum said yes.']),
    w('are', ['a','re'], ['/ar/','/_/'], [0,1], 'heart', ['We are here.']),
    w('he', ['h','e'], ['/h/','/ee/'], [1], 'heart', ['He can jump.']),
    w('she', ['sh','e'], ['/sh/','/ee/'], [1], 'heart', ['She has a cat.']),
    w('me', ['m','e'], ['/m/','/ee/'], [1], 'heart', ['Look at me.']),
    w('be', ['b','e'], ['/b/','/ee/'], [1], 'heart', ['I will be good.']),
    w('we', ['w','e'], ['/w/','/ee/'], [1], 'heart', ['We can play.']),
  ]},
  { id: 4, name: 'Set 4', words: [
    w('were', ['w','e','re'], ['/w/','/er/','/_/'], [1,2], 'heart', ['We were sad.']),
    w('has', ['h','a','s'], ['/h/','/a/','/z/'], [2], 'heart', ['He has a dog.']),
    w('look', ['l','oo','k'], ['/l/','/oo/','/k/'], [], 'decodable', ['Look at the sun.']),
    w('one', ['o','n','e'], ['/w/','/u/','/n/'], [0,2], 'heart', ['I have one hat.']),
  ]},
  { id: 5, name: 'Set 5', words: [
    w('his', ['h','i','s'], ['/h/','/i/','/z/'], [2], 'heart', ['His cat is fat.']),
    w('her', ['h','er'], ['/h/','/er/'], [], 'decodable', ['Her bag is red.']),
    w('them', ['th','e','m'], ['/th/','/e/','/m/'], [], 'decodable', ['I can see them.']),
    w('there', ['th','ere'], ['/th/','/air/'], [1], 'heart', ['Sit over there.']),
  ]},
  { id: 6, name: 'Set 6', words: [
    w('have', ['h','a','v','e'], ['/h/','/a/','/v/','/_/'], [3], 'heart', ['I have a pet.']),
    w('of', ['o','f'], ['/o/','/v/'], [1], 'heart', ['A cup of tea.']),
    w('here', ['h','ere'], ['/h/','/eer/'], [1], 'heart', ['Come here.']),
    w('with', ['w','i','th'], ['/w/','/i/','/th/'], [], 'decodable', ['Play with me.']),
  ]},
  { id: 7, name: 'Set 7', words: [
    w('all', ['a','ll'], ['/or/','/l/'], [], 'family', ['We all ran.']),
    w('call', ['c','a','ll'], ['/k/','/or/','/l/'], [], 'family', ['Call the dog.']),
    w('ball', ['b','a','ll'], ['/b/','/or/','/l/'], [], 'family', ['The ball is red.']),
    w('tall', ['t','a','ll'], ['/t/','/or/','/l/'], [], 'family', ['He is tall.']),
    w('little', ['l','i','tt','le'], ['/l/','/i/','/t/','/l/'], [3], 'heart', ['A little cat.']),
  ]},
  { id: 8, name: 'Set 8', words: [
    w('go', ['g','o'], ['/g/','/oa/'], [], 'decodable', ['Go to bed.']),
    w('so', ['s','o'], ['/s/','/oa/'], [], 'decodable', ['I am so hot.']),
    w('no', ['n','o'], ['/n/','/oa/'], [], 'decodable', ['No, not that one.']),
    w('this', ['th','i','s'], ['/th/','/i/','/s/'], [], 'decodable', ['This is fun.']),
    w('then', ['th','e','n'], ['/th/','/e/','/n/'], [], 'decodable', ['Then we ran.']),
  ]},
  { id: 9, name: 'Set 9', words: [
    w('put', ['p','u','t'], ['/p/','/oo/','/t/'], [1], 'heart', ['Put it down.']),
    w('as', ['a','s'], ['/a/','/z/'], [1], 'heart', ['As big as me.']),
    w('do', ['d','o'], ['/d/','/oo/'], [1], 'heart', ['Do it now.']),
    w('like', ['l','i','k','e'], ['/l/','/ie/','/k/','/_/'], [], 'decodable', ['I like cats.']),
    w('very', ['v','e','r','y'], ['/v/','/e/','/r/','/ee/'], [3], 'heart', ['It is very big.']),
  ]},
  { id: 10, name: 'Set 10', words: [
    w('what', ['wh','a','t'], ['/w/','/o/','/t/'], [1], 'heart', ['What is that?']),
    w('where', ['wh','ere'], ['/w/','/air/'], [1], 'heart', ['Where is my hat?']),
    w('want', ['w','a','n','t'], ['/w/','/o/','/n/','/t/'], [1], 'heart', ['I want a dog.']),
    w('some', ['s','o','m','e'], ['/s/','/u/','/m/','/_/'], [1,3], 'heart', ['I want some.']),
    w('come', ['c','o','m','e'], ['/k/','/u/','/m/','/_/'], [1,3], 'heart', ['Come and play.']),
  ]},
  { id: 11, name: 'Set 11', words: [
    w('down', ['d','ow','n'], ['/d/','/ow/','/n/'], [], 'decodable', ['Sit down here.']),
    w('out', ['ou','t'], ['/ow/','/t/'], [], 'decodable', ['Get out of bed.']),
    w('for', ['f','or'], ['/f/','/or/'], [], 'decodable', ['This is for you.']),
    w('or', ['or'], ['/or/'], [], 'decodable', ['Red or blue?']),
  ]},
  { id: 12, name: 'Set 12', words: [
    w('should', ['sh','ould'], ['/sh/','/ood/'], [1], 'heart', ['You should sit.']),
    w('would', ['w','ould'], ['/w/','/ood/'], [1], 'heart', ['Would you help?']),
    w('could', ['c','ould'], ['/k/','/ood/'], [1], 'heart', ['I could run fast.']),
  ]},
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- default-sets`
Expected: PASS (8 tests). If the grapheme-join assertion fails, the data is wrong — fix the data, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/words tests/unit/words
git commit -m "feat: add word model and 12 default sets with grapheme mapping"
```

---

## Task 3: Orthographic similarity

**Files:**
- Create: `src/lib/words/similarity.ts`
- Test: `tests/unit/words/similarity.test.ts`

**Interfaces:**
- Consumes: `Word` from `@/lib/words/types`.
- Produces: `similarity(a: string, b: string): number` (0 different → 1 identical); `rankBySimilarity(target: string, candidates: Word[]): Word[]` sorted most-similar first, target excluded.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/words/similarity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { similarity, rankBySimilarity } from '@/lib/words/similarity'
import type { Word } from '@/lib/words/types'

const mk = (text: string): Word => ({
  id: text, text, graphemes: [text], phonemes: ['/x/'],
  trickyIndices: [], classification: 'decodable',
  sentences: [`A ${text} here.`], audioId: text,
})

describe('similarity', () => {
  it('scores identical words as 1', () => {
    expect(similarity('them', 'them')).toBe(1)
  })

  it('scores near-miss pairs higher than unrelated pairs', () => {
    expect(similarity('them', 'then')).toBeGreaterThan(similarity('them', 'go'))
    expect(similarity('where', 'were')).toBeGreaterThan(similarity('where', 'a'))
  })

  it('is symmetric', () => {
    expect(similarity('said', 'says')).toBe(similarity('says', 'said'))
  })

  it('stays within 0..1', () => {
    for (const [a, b] of [['a', 'should'], ['I', 'I'], ['go', 'no']]) {
      const s = similarity(a, b)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('rankBySimilarity', () => {
  it('sorts most similar first and excludes the target itself', () => {
    const ranked = rankBySimilarity('them', [mk('go'), mk('then'), mk('them'), mk('the')])
    expect(ranked[0].text).toBe('then')
    expect(ranked.map((x) => x.text)).not.toContain('them')
  })

  it('is deterministic, breaking ties alphabetically', () => {
    const a = rankBySimilarity('the', [mk('be'), mk('me'), mk('we')]).map((x) => x.text)
    const b = rankBySimilarity('the', [mk('we'), mk('me'), mk('be')]).map((x) => x.text)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- similarity`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/words/similarity.ts`:

```ts
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

export function rankBySimilarity(target: string, candidates: Word[]): Word[] {
  return candidates
    .filter((c) => c.text.toLowerCase() !== target.toLowerCase())
    .map((c) => ({ c, s: similarity(target, c.text) }))
    .sort((p, q) => q.s - p.s || p.c.text.localeCompare(q.c.text))
    .map(({ c }) => c)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- similarity`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/words/similarity.ts tests/unit/words/similarity.test.ts
git commit -m "feat: add orthographic similarity for distractor selection"
```

---

## Task 4: Progress ladder

**Files:**
- Create: `src/lib/engine/types.ts`, `src/lib/engine/ladder.ts`
- Test: `tests/unit/engine/ladder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Stage = 'new' | 'learning' | 'reviewing' | 'known'`
  - `interface WordProgress { wordId: string; stage: Stage; box: number; dueInSessions: number; correctStreak: number; attempts: number; lapses: number; struggling: boolean }`
  - `BOX_INTERVALS = [0,1,2,4,8,16]`, `MAX_BOX = 5`
  - `newProgress(wordId)`, `recordCorrect(p, prompted)`, `recordMiss(p)`, `decrementDue(p)`, `isDue(p)`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/engine/ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  newProgress, recordCorrect, recordMiss, decrementDue, isDue, BOX_INTERVALS,
} from '@/lib/engine/ladder'

describe('ladder', () => {
  it('starts a word new, in box 0, due immediately', () => {
    const p = newProgress('said')
    expect(p).toMatchObject({
      wordId: 'said', stage: 'new', box: 0, dueInSessions: 0,
      correctStreak: 0, attempts: 0, lapses: 0, struggling: false,
    })
    expect(isDue(p)).toBe(true)
  })

  it('uses expanding intervals measured in sessions', () => {
    expect([...BOX_INTERVALS]).toEqual([0, 1, 2, 4, 8, 16])
  })

  it('promotes one box on an unprompted correct answer', () => {
    const p = recordCorrect(newProgress('said'), false)
    expect(p.box).toBe(1)
    expect(p.correctStreak).toBe(1)
    expect(p.attempts).toBe(1)
    expect(p.dueInSessions).toBe(BOX_INTERVALS[1])
  })

  it('does not promote on a prompted correct answer, but counts the attempt', () => {
    const p = recordCorrect(newProgress('said'), true)
    expect(p.box).toBe(0)
    expect(p.attempts).toBe(1)
    expect(p.correctStreak).toBe(0)
  })

  it('moves new -> learning -> reviewing -> known as the box climbs', () => {
    let p = newProgress('said')
    expect(p.stage).toBe('new')
    p = recordCorrect(p, false)
    expect(p.stage).toBe('learning')
    p = recordCorrect(p, false); p = recordCorrect(p, false)
    expect(p.stage).toBe('reviewing')
    p = recordCorrect(p, false); p = recordCorrect(p, false)
    expect(p.box).toBe(5)
    expect(p.stage).toBe('known')
  })

  it('never climbs past the top box', () => {
    let p = newProgress('said')
    for (let i = 0; i < 20; i++) p = recordCorrect(p, false)
    expect(p.box).toBe(5)
  })

  it('drops to box 0 on a miss and counts a lapse', () => {
    let p = newProgress('said')
    for (let i = 0; i < 4; i++) p = recordCorrect(p, false)
    p = recordMiss(p)
    expect(p).toMatchObject({ box: 0, lapses: 1, correctStreak: 0, dueInSessions: 0 })
    expect(p.stage).toBe('learning')
  })

  it('never returns a lapsed word to the new stage', () => {
    const p = recordMiss(recordCorrect(newProgress('said'), false))
    expect(p.stage).not.toBe('new')
  })

  it('counts down due sessions but never below zero', () => {
    let p = recordCorrect(newProgress('said'), false)
    expect(p.dueInSessions).toBe(1)
    p = decrementDue(p)
    expect(p.dueInSessions).toBe(0)
    expect(isDue(p)).toBe(true)
    p = decrementDue(p)
    expect(p.dueInSessions).toBe(0)
  })

  it('does not mutate the input', () => {
    const p = newProgress('said')
    recordCorrect(p, false)
    expect(p.box).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ladder`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types**

Create `src/lib/engine/types.ts`:

```ts
export type Stage = 'new' | 'learning' | 'reviewing' | 'known'

export interface WordProgress {
  wordId: string
  stage: Stage
  box: number
  /** Sessions remaining before this word is due again. */
  dueInSessions: number
  correctStreak: number
  attempts: number
  lapses: number
  struggling: boolean
}
```

- [ ] **Step 4: Write the ladder**

Create `src/lib/engine/ladder.ts`:

```ts
import type { Stage, WordProgress } from './types'

export type { Stage, WordProgress }

/**
 * Expanding intervals, measured in SESSIONS rather than days.
 *
 * A child who plays twice a week still advances; a child who plays daily
 * is not buried in review. Time-based intervals punish irregular play,
 * which is exactly what family life produces.
 */
export const BOX_INTERVALS = [0, 1, 2, 4, 8, 16] as const
export const MAX_BOX = BOX_INTERVALS.length - 1

function stageForBox(box: number, everAttempted: boolean): Stage {
  if (box >= MAX_BOX) return 'known'
  if (box >= 3) return 'reviewing'
  if (everAttempted) return 'learning'
  return 'new'
}

export function newProgress(wordId: string): WordProgress {
  return {
    wordId, stage: 'new', box: 0, dueInSessions: 0,
    correctStreak: 0, attempts: 0, lapses: 0, struggling: false,
  }
}

/**
 * A prompted correct answer is real practice but not evidence of recall,
 * so it counts as an attempt without promoting the word. This is what
 * makes errorless support safe: heavy prompting cannot inflate progress.
 */
export function recordCorrect(p: WordProgress, prompted: boolean): WordProgress {
  const box = prompted ? p.box : Math.min(MAX_BOX, p.box + 1)
  return {
    ...p, box,
    attempts: p.attempts + 1,
    correctStreak: prompted ? p.correctStreak : p.correctStreak + 1,
    dueInSessions: BOX_INTERVALS[box],
    stage: stageForBox(box, true),
  }
}

export function recordMiss(p: WordProgress): WordProgress {
  return {
    ...p, box: 0,
    attempts: p.attempts + 1,
    correctStreak: 0,
    lapses: p.lapses + 1,
    dueInSessions: 0,
    stage: stageForBox(0, true),
  }
}

export function decrementDue(p: WordProgress): WordProgress {
  return { ...p, dueInSessions: Math.max(0, p.dueInSessions - 1) }
}

export function isDue(p: WordProgress): boolean {
  return p.dueInSessions <= 0
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ladder`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine tests/unit/engine
git commit -m "feat: add expanding-interval progress ladder"
```

---

## Task 5: Struggler detection and errorless support fading

**Files:**
- Create: `src/lib/engine/strugglers.ts`, `src/lib/engine/support.ts`
- Test: `tests/unit/engine/strugglers.test.ts`, `tests/unit/engine/support.test.ts`

**Interfaces:**
- Consumes: `WordProgress`, `recordCorrect`, `recordMiss`.
- Produces:
  - `STRUGGLE_LAPSE_THRESHOLD = 3`, `STRUGGLE_CLEAR_STREAK = 2`, `applyStruggleRules(p: WordProgress): WordProgress`
  - `type DistractorSimilarity = 'far' | 'different-initial' | 'shared-letter' | 'near'`
  - `interface SupportLevel { choices: number; similarity: DistractorSimilarity; speakBeforeRound: boolean; showWordBeforeRound: boolean }`
  - `supportFor(p: WordProgress): SupportLevel`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/engine/strugglers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newProgress, recordCorrect, recordMiss } from '@/lib/engine/ladder'
import {
  applyStruggleRules, STRUGGLE_LAPSE_THRESHOLD, STRUGGLE_CLEAR_STREAK,
} from '@/lib/engine/strugglers'

const missTimes = (n: number) => {
  let p = newProgress('where')
  for (let i = 0; i < n; i++) p = applyStruggleRules(recordMiss(p))
  return p
}

describe('struggler detection', () => {
  it('uses a 3-lapse threshold and a 2-streak clear', () => {
    expect(STRUGGLE_LAPSE_THRESHOLD).toBe(3)
    expect(STRUGGLE_CLEAR_STREAK).toBe(2)
  })

  it('does not flag a word before the threshold', () => {
    expect(missTimes(2).struggling).toBe(false)
  })

  it('flags a word on the third lapse', () => {
    expect(missTimes(3).struggling).toBe(true)
  })

  it('keeps the flag after only one unprompted correct answer', () => {
    expect(applyStruggleRules(recordCorrect(missTimes(3), false)).struggling).toBe(true)
  })

  it('clears the flag after two consecutive unprompted correct answers', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, false))
    p = applyStruggleRules(recordCorrect(p, false))
    expect(p.struggling).toBe(false)
  })

  it('does not let prompted answers clear the flag', () => {
    let p = missTimes(3)
    p = applyStruggleRules(recordCorrect(p, true))
    p = applyStruggleRules(recordCorrect(p, true))
    expect(p.struggling).toBe(true)
  })
})
```

Create `tests/unit/engine/support.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newProgress } from '@/lib/engine/ladder'
import { supportFor } from '@/lib/engine/support'
import type { WordProgress } from '@/lib/engine/types'

const at = (box: number, struggling = false): WordProgress => ({
  ...newProgress('some'), box, struggling,
})

describe('support level (errorless fading)', () => {
  it('gives a brand-new word two far-apart choices and full prompting', () => {
    expect(supportFor(at(0))).toEqual({
      choices: 2, similarity: 'far',
      speakBeforeRound: true, showWordBeforeRound: true,
    })
  })

  it('stops showing the word once past box 0', () => {
    expect(supportFor(at(1)).showWordBeforeRound).toBe(false)
    expect(supportFor(at(1)).speakBeforeRound).toBe(true)
  })

  it('stops speaking unprompted from box 2', () => {
    expect(supportFor(at(2)).speakBeforeRound).toBe(false)
  })

  it('widens the choice count as the word strengthens', () => {
    expect([0,1,2,3,4,5].map((b) => supportFor(at(b)).choices))
      .toEqual([2, 3, 3, 4, 4, 4])
  })

  it('tightens distractor similarity as the word strengthens', () => {
    expect([0,1,2,3,4,5].map((b) => supportFor(at(b)).similarity)).toEqual([
      'far', 'different-initial', 'different-initial',
      'shared-letter', 'near', 'near',
    ])
  })

  it('returns a struggling word all the way to errorless, whatever its box', () => {
    expect(supportFor(at(4, true))).toEqual(supportFor(at(0)))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- strugglers support`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write strugglers**

Create `src/lib/engine/strugglers.ts`:

```ts
import type { WordProgress } from './types'

export const STRUGGLE_LAPSE_THRESHOLD = 3
export const STRUGGLE_CLEAR_STREAK = 2

/**
 * Call after every recordCorrect / recordMiss.
 *
 * A word that keeps being missed returns to errorless presentation rather
 * than being drilled harder — frustration is the thing most likely to
 * make a five-year-old stop playing. The flag clears only on unprompted
 * successes, so heavy support cannot quietly clear it.
 */
export function applyStruggleRules(p: WordProgress): WordProgress {
  if (!p.struggling && p.lapses >= STRUGGLE_LAPSE_THRESHOLD) {
    return { ...p, struggling: true }
  }
  if (p.struggling && p.correctStreak >= STRUGGLE_CLEAR_STREAK) {
    return { ...p, struggling: false }
  }
  return p
}
```

- [ ] **Step 4: Write support**

Create `src/lib/engine/support.ts`:

```ts
import type { WordProgress } from './types'

export type DistractorSimilarity =
  | 'far' | 'different-initial' | 'shared-letter' | 'near'

export interface SupportLevel {
  choices: number
  similarity: DistractorSimilarity
  speakBeforeRound: boolean
  showWordBeforeRound: boolean
}

const LEVELS: readonly SupportLevel[] = [
  { choices: 2, similarity: 'far',               speakBeforeRound: true,  showWordBeforeRound: true  },
  { choices: 3, similarity: 'different-initial', speakBeforeRound: true,  showWordBeforeRound: false },
  { choices: 3, similarity: 'different-initial', speakBeforeRound: false, showWordBeforeRound: false },
  { choices: 4, similarity: 'shared-letter',     speakBeforeRound: false, showWordBeforeRound: false },
  { choices: 4, similarity: 'near',              speakBeforeRound: false, showWordBeforeRound: false },
  { choices: 4, similarity: 'near',              speakBeforeRound: false, showWordBeforeRound: false },
]

/**
 * Support is derived from the word's box, never set independently, so
 * prompting fades automatically as recall strengthens. A struggling word
 * drops straight back to the fully errorless level.
 */
export function supportFor(p: WordProgress): SupportLevel {
  if (p.struggling) return LEVELS[0]
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, p.box))]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- strugglers support`
Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine tests/unit/engine
git commit -m "feat: add struggler detection and errorless support fading"
```

---

## Task 6: Distractor selection

**Files:**
- Create: `src/lib/engine/distractors.ts`
- Test: `tests/unit/engine/distractors.test.ts`

**Interfaces:**
- Consumes: `rankBySimilarity`, `similarity`, `SupportLevel`, `Word`.
- Produces: `pickDistractors(target: Word, pool: Word[], support: SupportLevel, rng?: () => number): Word[]` — returns exactly `support.choices - 1` words where the pool allows, never the target, never duplicates.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/engine/distractors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickDistractors } from '@/lib/engine/distractors'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { Word } from '@/lib/words/types'

const ALL: Word[] = DEFAULT_SETS.flatMap((s) => s.words)
const byText = (t: string) => ALL.find((w) => w.text === t)!
const rng = () => 0.5

describe('pickDistractors', () => {
  it('returns one fewer word than the choice count', () => {
    const s = supportFor({ ...newProgress('them'), box: 3 })
    expect(pickDistractors(byText('them'), ALL, s, rng)).toHaveLength(3)
  })

  it('never includes the target and never duplicates', () => {
    const s = supportFor({ ...newProgress('them'), box: 4 })
    const picked = pickDistractors(byText('them'), ALL, s, rng)
    expect(picked.map((w) => w.text)).not.toContain('them')
    expect(new Set(picked.map((w) => w.id)).size).toBe(picked.length)
  })

  it('picks a far-apart distractor at the errorless level', () => {
    const s = supportFor(newProgress('them'))
    const picked = pickDistractors(byText('them'), ALL, s, rng)
    expect(picked).toHaveLength(1)
    expect(picked[0].text[0]).not.toBe('t')
  })

  it('picks confusable distractors at the hardest level', () => {
    const s = supportFor({ ...newProgress('them'), box: 5 })
    const texts = pickDistractors(byText('them'), ALL, s, rng).map((w) => w.text)
    expect(texts.some((t) => ['then', 'the', 'there', 'they'].includes(t))).toBe(true)
  })

  it('avoids sharing the initial letter at the different-initial level', () => {
    const s = supportFor({ ...newProgress('call'), box: 1 })
    const picked = pickDistractors(byText('call'), ALL, s, rng)
    expect(picked.every((w) => w.text[0] !== 'c')).toBe(true)
  })

  it('falls back gracefully when the pool cannot satisfy the rule', () => {
    const tiny = [byText('go'), byText('no'), byText('so')]
    const s = supportFor({ ...newProgress('go'), box: 5 })
    const picked = pickDistractors(byText('go'), tiny, s, rng)
    expect(picked).toHaveLength(2)
    expect(picked.map((w) => w.text).sort()).toEqual(['no', 'so'])
  })

  it('is deterministic for a given rng', () => {
    const s = supportFor({ ...newProgress('what'), box: 3 })
    const a = pickDistractors(byText('what'), ALL, s, rng).map((w) => w.id)
    const b = pickDistractors(byText('what'), ALL, s, rng).map((w) => w.id)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- distractors`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/engine/distractors.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- distractors`
Expected: PASS (7 tests). If the `far` case still shares an initial letter, the filter order is wrong — fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/distractors.ts tests/unit/engine/distractors.test.ts
git commit -m "feat: add support-matched distractor selection"
```

---

## Task 7: Session composition and set unlocking

**Files:**
- Create: `src/lib/engine/session.ts`, `src/lib/engine/unlock.ts`
- Test: `tests/unit/engine/session.test.ts`, `tests/unit/engine/unlock.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–6.
- Produces:
  - `interface Round { word: Word; distractors: Word[]; support: SupportLevel; isFinal: boolean }`
  - `interface SessionPlan { rounds: Round[] }`
  - `planSession(opts: { words: Word[]; progress: Map<string, WordProgress>; length?: number; rng?: () => number }): SessionPlan`
  - `SESSION_LENGTH = 10`, `NEW_WORD_RATIO = 0.4`, `MAX_STRUGGLER_APPEARANCES = 1`
  - `UNLOCK_THRESHOLD = 0.8`, `isSetComplete(words: Word[], progress: Map<string, WordProgress>): boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/engine/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planSession, SESSION_LENGTH, MAX_STRUGGLER_APPEARANCES } from '@/lib/engine/session'
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

describe('planSession', () => {
  it('plans a session of the configured length', () => {
    expect(planSession({ words: WORDS, progress: progressWhere({}), rng }).rounds)
      .toHaveLength(SESSION_LENGTH)
  })

  it('always ends on the strongest word, so every session ends on a success', () => {
    const progress = progressWhere({ the: { box: 5, stage: 'known' } })
    const { rounds } = planSession({ words: WORDS, progress, rng })
    const final = rounds[rounds.length - 1]
    expect(final.isFinal).toBe(true)
    expect(final.word.id).toBe('the')
  })

  it('marks only the last round as final', () => {
    const { rounds } = planSession({ words: WORDS, progress: progressWhere({}), rng })
    expect(rounds.filter((r) => r.isFinal)).toHaveLength(1)
  })

  it('caps a struggling word to one appearance so it never dominates', () => {
    const progress = progressWhere({ said: { struggling: true, lapses: 3, box: 0 } })
    const { rounds } = planSession({ words: WORDS, progress, rng })
    expect(rounds.filter((r) => r.word.id === 'said').length)
      .toBeLessThanOrEqual(MAX_STRUGGLER_APPEARANCES)
  })

  it('gives every round distractors matching its support level', () => {
    const { rounds } = planSession({ words: WORDS, progress: progressWhere({}), rng })
    for (const r of rounds) {
      expect(r.distractors).toHaveLength(r.support.choices - 1)
      expect(r.distractors.map((d) => d.id)).not.toContain(r.word.id)
    }
  })

  it('prefers due words over words not yet due', () => {
    const progress = progressWhere({})
    for (const w of WORDS.slice(5)) {
      progress.set(w.id, { ...progress.get(w.id)!, box: 4, dueInSessions: 8 })
    }
    const { rounds } = planSession({ words: WORDS, progress, rng })
    const dueIds = WORDS.slice(0, 5).map((w) => w.id)
    expect(rounds.filter((r) => dueIds.includes(r.word.id)).length)
      .toBeGreaterThan(rounds.length / 2)
  })

  it('mixes new and review work once some words have been learned', () => {
    const progress = progressWhere({})
    for (const w of WORDS.slice(0, 8)) {
      progress.set(w.id, recordCorrect(newProgress(w.id), false))
    }
    const { rounds } = planSession({ words: WORDS, progress, rng })
    const learned = new Set(WORDS.slice(0, 8).map((w) => w.id))
    expect(rounds.some((r) => learned.has(r.word.id))).toBe(true)
    expect(rounds.some((r) => !learned.has(r.word.id))).toBe(true)
  })

  it('still plans a session when only one word is available', () => {
    const one = [WORDS[0]]
    const { rounds } = planSession({ words: one, progress: progressWhere({}), rng })
    expect(rounds.length).toBeGreaterThan(0)
    expect(rounds.every((r) => r.word.id === one[0].id)).toBe(true)
  })

  it('returns no rounds when there are no words', () => {
    expect(planSession({ words: [], progress: new Map(), rng }).rounds).toEqual([])
  })

  it('is deterministic for a given rng', () => {
    const a = planSession({ words: WORDS, progress: progressWhere({}), rng })
    const b = planSession({ words: WORDS, progress: progressWhere({}), rng })
    expect(a.rounds.map((r) => r.word.id)).toEqual(b.rounds.map((r) => r.word.id))
  })
})
```

Create `tests/unit/engine/unlock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSetComplete, UNLOCK_THRESHOLD } from '@/lib/engine/unlock'
import { newProgress } from '@/lib/engine/ladder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import type { WordProgress } from '@/lib/engine/types'

const set1 = DEFAULT_SETS[0].words // 5 words

function withKnown(n: number) {
  const m = new Map<string, WordProgress>()
  set1.forEach((w, i) => {
    m.set(w.id, i < n
      ? { ...newProgress(w.id), box: 5, stage: 'known' }
      : newProgress(w.id))
  })
  return m
}

describe('set unlocking', () => {
  it('uses an 80% threshold', () => {
    expect(UNLOCK_THRESHOLD).toBe(0.8)
  })

  it('needs 4 of 5 words known to complete a 5-word set', () => {
    expect(isSetComplete(set1, withKnown(3))).toBe(false)
    expect(isSetComplete(set1, withKnown(4))).toBe(true)
  })

  it('treats an all-known set as complete', () => {
    expect(isSetComplete(set1, withKnown(5))).toBe(true)
  })

  it('treats an empty set as incomplete rather than dividing by zero', () => {
    expect(isSetComplete([], new Map())).toBe(false)
  })

  it('does not count words that are merely reviewing', () => {
    const m = new Map<string, WordProgress>()
    for (const w of set1) m.set(w.id, { ...newProgress(w.id), box: 3, stage: 'reviewing' })
    expect(isSetComplete(set1, m)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- session unlock`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write unlock**

Create `src/lib/engine/unlock.ts`:

```ts
import type { Word } from '@/lib/words/types'
import type { WordProgress } from './types'

export const UNLOCK_THRESHOLD = 0.8

/**
 * A set opens the next one at 80% known. Requiring every word would
 * strand a child on one stubborn word and stall the whole map.
 */
export function isSetComplete(
  words: Word[],
  progress: Map<string, WordProgress>,
): boolean {
  if (words.length === 0) return false
  const known = words.filter((w) => progress.get(w.id)?.stage === 'known').length
  return known / words.length >= UNLOCK_THRESHOLD
}
```

- [ ] **Step 4: Write session**

Create `src/lib/engine/session.ts`:

```ts
import type { Word } from '@/lib/words/types'
import type { WordProgress } from './types'
import { isDue, newProgress } from './ladder'
import { supportFor, type SupportLevel } from './support'
import { pickDistractors } from './distractors'

export const SESSION_LENGTH = 10
export const NEW_WORD_RATIO = 0.4
export const MAX_STRUGGLER_APPEARANCES = 1

export interface Round {
  word: Word
  distractors: Word[]
  support: SupportLevel
  isFinal: boolean
}

export interface SessionPlan {
  rounds: Round[]
}

interface PlanOpts {
  words: Word[]
  progress: Map<string, WordProgress>
  length?: number
  rng?: () => number
}

const get = (progress: Map<string, WordProgress>, w: Word) =>
  progress.get(w.id) ?? newProgress(w.id)

/**
 * Compose a session of roughly 40% new words and 60% review, drawn first
 * from words that are due.
 *
 * Two rules matter more than the ratio:
 *   - a struggling word appears at most once, so it never dominates
 *   - the session ALWAYS ends on the child's strongest available word,
 *     so every sitting finishes on a success
 */
export function planSession(opts: PlanOpts): SessionPlan {
  const { words, progress, length = SESSION_LENGTH, rng = Math.random } = opts
  if (words.length === 0) return { rounds: [] }

  const isNew = (w: Word) => get(progress, w).stage === 'new'
  const pool = [
    ...words.filter((w) => isDue(get(progress, w))),
    ...words.filter((w) => !isDue(get(progress, w))),
  ]
  const newWords = pool.filter(isNew)
  const reviewWords = pool.filter((w) => !isNew(w))

  const picks: Word[] = []
  const struggleCount = new Map<string, number>()

  const canTake = (w: Word) =>
    !get(progress, w).struggling ||
    (struggleCount.get(w.id) ?? 0) < MAX_STRUGGLER_APPEARANCES

  const take = (from: Word[], want: number) => {
    if (from.length === 0) return
    let taken = 0
    for (let i = 0; taken < want && picks.length < length && i < from.length * 4; i++) {
      const w = from[i % from.length]
      if (!canTake(w)) continue
      if (get(progress, w).struggling) {
        struggleCount.set(w.id, (struggleCount.get(w.id) ?? 0) + 1)
      }
      picks.push(w)
      taken++
    }
  }

  take(newWords, Math.round(length * NEW_WORD_RATIO))
  take(reviewWords, length - picks.length)
  if (picks.length < length) take(pool, length - picks.length)

  // The final round is the strongest word available — every session ends
  // on a success. Ties break on word id so the plan stays deterministic.
  const strongest = [...pool].sort((a, b) => {
    const d = get(progress, b).box - get(progress, a).box
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })[0]

  const ordered = [...picks.slice(0, Math.max(0, length - 1)), strongest]

  return {
    rounds: ordered.map((word, idx) => {
      const support = supportFor(get(progress, word))
      return {
        word,
        distractors: pickDistractors(word, words, support, rng),
        support,
        isFinal: idx === ordered.length - 1,
      }
    }),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- session unlock`
Expected: PASS (15 tests).

- [ ] **Step 6: Run the whole suite, then commit**

```bash
npm test && npm run typecheck
git add src/lib/engine tests/unit/engine
git commit -m "feat: add session composition and set unlocking"
```

---

## Task 8: Fail-closed mode resolution

**Files:**
- Create: `src/lib/mode.ts`
- Test: `tests/unit/mode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type AppMode = 'family' | 'public'`, `resolveMode(env: Record<string, string | undefined>): AppMode`, `isPublicMode(): boolean`, `isFamilyMode(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveMode } from '@/lib/mode'

describe('resolveMode', () => {
  it('defaults to family when unset', () => {
    expect(resolveMode({})).toBe('family')
  })

  it('reads public mode from the env var', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: 'public' })).toBe('public')
  })

  it('ignores case and surrounding whitespace', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: '  PUBLIC ' })).toBe('public')
  })

  it('fails closed to family on an unrecognised value', () => {
    expect(resolveMode({ TRICKYWORDS_MODE: 'publik' })).toBe('family')
    expect(resolveMode({ TRICKYWORDS_MODE: '' })).toBe('family')
  })
})
```

The fail-closed direction matters: a typo must never silently produce a public deployment the operator believes is private. The opposite mistake is loud and harmless.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mode`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mode.ts`:

```ts
export type AppMode = 'family' | 'public'

/**
 * Fails closed to 'family'. A typo in the env var must never produce a
 * public deployment the operator believes is private — the opposite
 * mistake is loud and harmless.
 */
export function resolveMode(env: Record<string, string | undefined>): AppMode {
  return env.TRICKYWORDS_MODE?.trim().toLowerCase() === 'public'
    ? 'public'
    : 'family'
}

export const isPublicMode = () => resolveMode(process.env) === 'public'
export const isFamilyMode = () => resolveMode(process.env) === 'family'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mode`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mode.ts tests/unit/mode.test.ts
git commit -m "feat: add fail-closed app mode resolution"
```

---

## Task 9: SQLite persistence (family mode)

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/profiles.ts`, `src/lib/db/progress.ts`
- Test: `tests/unit/db/profiles.test.ts`, `tests/unit/db/progress.test.ts`

**Interfaces:**
- Consumes: `WordProgress`, `Stage`.
- Produces:
  - `type Db`, `getDb(path?: string): Db` — opens SQLite, sets WAL, applies DDL
  - `interface Profile { id: number; name: string; avatar: string; createdAt: number }`
  - `createProfile(db, { name, avatar }): Profile`, `listProfiles(db): Profile[]`, `deleteProfile(db, id): void`
  - `loadProgress(db, profileId): Map<string, WordProgress>`, `saveProgress(db, profileId, p): void`
  - `getSetting(db, key): string | null`, `setSetting(db, key, value): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/db/profiles.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, type Db } from '@/lib/db/client'
import { createProfile, listProfiles, deleteProfile } from '@/lib/db/profiles'

let db: Db
beforeEach(() => { db = getDb(':memory:') })

describe('profiles', () => {
  it('starts with no profiles', () => {
    expect(listProfiles(db)).toEqual([])
  })

  it('creates and lists a profile', () => {
    const p = createProfile(db, { name: 'Robin', avatar: 'fox' })
    expect(p.id).toBeGreaterThan(0)
    expect(listProfiles(db)[0]).toMatchObject({ name: 'Robin', avatar: 'fox' })
  })

  it('supports several children on one install', () => {
    createProfile(db, { name: 'Robin', avatar: 'fox' })
    createProfile(db, { name: 'Sam', avatar: 'owl' })
    expect(listProfiles(db)).toHaveLength(2)
  })

  it('deletes a profile', () => {
    const p = createProfile(db, { name: 'Alex', avatar: 'bee' })
    deleteProfile(db, p.id)
    expect(listProfiles(db)).toEqual([])
  })

  it('rejects an empty name', () => {
    expect(() => createProfile(db, { name: '  ', avatar: 'fox' })).toThrow()
  })
})
```

Create `tests/unit/db/progress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, type Db } from '@/lib/db/client'
import { createProfile, deleteProfile } from '@/lib/db/profiles'
import { loadProgress, saveProgress, getSetting, setSetting } from '@/lib/db/progress'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'

let db: Db
let profileId: number

beforeEach(() => {
  db = getDb(':memory:')
  profileId = createProfile(db, { name: 'Robin', avatar: 'fox' }).id
})

describe('progress persistence', () => {
  it('returns an empty map for a fresh profile', () => {
    expect(loadProgress(db, profileId).size).toBe(0)
  })

  it('round-trips a word progress record exactly', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveProgress(db, profileId, p)
    expect(loadProgress(db, profileId).get('said')).toEqual(p)
  })

  it('updates rather than duplicating on repeat saves', () => {
    let p = newProgress('said')
    saveProgress(db, profileId, p)
    p = recordCorrect(p, false)
    saveProgress(db, profileId, p)
    const loaded = loadProgress(db, profileId)
    expect(loaded.size).toBe(1)
    expect(loaded.get('said')!.box).toBe(1)
  })

  it('preserves the struggling flag across a round trip', () => {
    saveProgress(db, profileId, { ...newProgress('where'), struggling: true })
    expect(loadProgress(db, profileId).get('where')!.struggling).toBe(true)
  })

  it('keeps each child progress separate', () => {
    const other = createProfile(db, { name: 'Sam', avatar: 'owl' }).id
    saveProgress(db, profileId, recordCorrect(newProgress('said'), false))
    expect(loadProgress(db, other).size).toBe(0)
  })

  it('removes a child progress when the profile is deleted', () => {
    saveProgress(db, profileId, newProgress('said'))
    deleteProfile(db, profileId)
    expect(loadProgress(db, profileId).size).toBe(0)
  })
})

describe('settings', () => {
  it('returns null for a missing key', () => {
    expect(getSetting(db, 'pin')).toBeNull()
  })

  it('round-trips and overwrites a setting', () => {
    setSetting(db, 'pin', 'hash-a')
    expect(getSetting(db, 'pin')).toBe('hash-a')
    setSetting(db, 'pin', 'hash-b')
    expect(getSetting(db, 'pin')).toBe('hash-b')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- db`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the schema**

Create `src/lib/db/schema.ts`:

```ts
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const progress = sqliteTable('progress', {
  profileId: integer('profile_id').notNull(),
  wordId: text('word_id').notNull(),
  stage: text('stage').notNull(),
  box: integer('box').notNull(),
  dueInSessions: integer('due_in_sessions').notNull(),
  correctStreak: integer('correct_streak').notNull(),
  attempts: integer('attempts').notNull(),
  lapses: integer('lapses').notNull(),
  struggling: integer('struggling').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.profileId, t.wordId] }) }))

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
```

- [ ] **Step 4: Write the client**

Create `src/lib/db/client.ts`. DDL runs at open so the container needs no separate migration step:

```ts
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const DDL = `
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  profile_id INTEGER NOT NULL,
  word_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  box INTEGER NOT NULL,
  due_in_sessions INTEGER NOT NULL,
  correct_streak INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  struggling INTEGER NOT NULL,
  PRIMARY KEY (profile_id, word_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export function getDb(
  path = process.env.TRICKYWORDS_DB ?? './data/trickywords.db',
): Db {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(DDL)
  return drizzle(sqlite, { schema })
}
```

- [ ] **Step 5: Write profiles and progress**

Create `src/lib/db/profiles.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { profiles, progress } from './schema'

export interface Profile {
  id: number
  name: string
  avatar: string
  createdAt: number
}

export function createProfile(
  db: Db, input: { name: string; avatar: string },
): Profile {
  const name = input.name.trim()
  if (!name) throw new Error('Profile name cannot be empty')
  const [row] = db.insert(profiles)
    .values({ name, avatar: input.avatar, createdAt: Date.now() })
    .returning().all()
  return row as Profile
}

export function listProfiles(db: Db): Profile[] {
  return db.select().from(profiles).all() as Profile[]
}

/** Deleting a child removes their progress too — nothing is left orphaned. */
export function deleteProfile(db: Db, id: number): void {
  db.delete(progress).where(eq(progress.profileId, id)).run()
  db.delete(profiles).where(eq(profiles.id, id)).run()
}
```

Create `src/lib/db/progress.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { progress, settings } from './schema'
import type { Stage, WordProgress } from '@/lib/engine/types'

export function loadProgress(
  db: Db, profileId: number,
): Map<string, WordProgress> {
  const rows = db.select().from(progress)
    .where(eq(progress.profileId, profileId)).all()
  return new Map(rows.map((r) => [r.wordId, {
    wordId: r.wordId,
    stage: r.stage as Stage,
    box: r.box,
    dueInSessions: r.dueInSessions,
    correctStreak: r.correctStreak,
    attempts: r.attempts,
    lapses: r.lapses,
    struggling: r.struggling === 1,
  }]))
}

export function saveProgress(
  db: Db, profileId: number, p: WordProgress,
): void {
  const values = {
    stage: p.stage, box: p.box, dueInSessions: p.dueInSessions,
    correctStreak: p.correctStreak, attempts: p.attempts,
    lapses: p.lapses, struggling: p.struggling ? 1 : 0,
  }
  db.insert(progress)
    .values({ profileId, wordId: p.wordId, ...values })
    .onConflictDoUpdate({
      target: [progress.profileId, progress.wordId],
      set: values,
    }).run()
}

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } }).run()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- db`
Expected: PASS (13 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db tests/unit/db
git commit -m "feat: add SQLite persistence for profiles and progress"
```

---

## Task 10: Guest session store (public mode)

**Files:**
- Create: `src/lib/guest/store.ts`
- Test: `tests/unit/guest/store.test.ts`

**Interfaces:**
- Consumes: `WordProgress`.
- Produces: `GUEST_KEY = 'trickywords.guest'`, `interface GuestState { avatar: string | null; progress: Record<string, WordProgress>; stickers: string[]; startedAt: number }`, `loadGuest(): GuestState`, `saveGuest(s: GuestState): void`, `clearGuest(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/guest/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadGuest, saveGuest, clearGuest, GUEST_KEY } from '@/lib/guest/store'
import { newProgress, recordCorrect } from '@/lib/engine/ladder'

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

describe('guest store', () => {
  it('uses sessionStorage, not localStorage or cookies', () => {
    saveGuest({ avatar: 'fox', progress: {}, stickers: [], startedAt: 1 })
    expect(sessionStorage.getItem(GUEST_KEY)).not.toBeNull()
    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
    expect(document.cookie).not.toContain('trickywords')
  })

  it('returns a fresh state when nothing is stored', () => {
    const s = loadGuest()
    expect(s.avatar).toBeNull()
    expect(s.progress).toEqual({})
    expect(s.stickers).toEqual([])
  })

  it('round-trips guest progress', () => {
    const p = recordCorrect(newProgress('said'), false)
    saveGuest({ avatar: 'owl', progress: { said: p }, stickers: ['star'], startedAt: 5 })
    const s = loadGuest()
    expect(s.avatar).toBe('owl')
    expect(s.progress.said).toEqual(p)
    expect(s.stickers).toEqual(['star'])
  })

  it('clears everything for the next child on a shared device', () => {
    saveGuest({ avatar: 'bee', progress: { a: newProgress('a') }, stickers: ['x'], startedAt: 1 })
    clearGuest()
    expect(loadGuest().avatar).toBeNull()
    expect(sessionStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('recovers from corrupt stored data rather than crashing mid-game', () => {
    sessionStorage.setItem(GUEST_KEY, '{not json')
    expect(() => loadGuest()).not.toThrow()
    expect(loadGuest().avatar).toBeNull()
  })

  it('survives a refresh, because sessionStorage persists per tab', () => {
    saveGuest({ avatar: 'fox', progress: {}, stickers: [], startedAt: 1 })
    // A refresh re-runs module code but does not clear sessionStorage.
    expect(loadGuest().avatar).toBe('fox')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guest`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/guest/store.ts`:

```ts
import type { WordProgress } from '@/lib/engine/types'

export const GUEST_KEY = 'trickywords.guest'

export interface GuestState {
  avatar: string | null
  progress: Record<string, WordProgress>
  stickers: string[]
  startedAt: number
}

const empty = (): GuestState => ({
  avatar: null, progress: {}, stickers: [], startedAt: Date.now(),
})

/**
 * Guest progress lives in sessionStorage, deliberately:
 *   - per tab, so two children on one device never collide and the
 *     server holds no per-visitor state at all
 *   - survives a refresh, so an accidental pull-to-refresh on a tablet
 *     does not wipe a child's game
 *   - gone when the tab closes, so nothing is retained
 *   - never sent to the server, unlike a cookie, so there is no consent
 *     obligation and nothing server-side to leak
 */
export function loadGuest(): GuestState {
  if (typeof sessionStorage === 'undefined') return empty()
  try {
    const raw = sessionStorage.getItem(GUEST_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<GuestState>
    return {
      avatar: parsed.avatar ?? null,
      progress: parsed.progress ?? {},
      stickers: parsed.stickers ?? [],
      startedAt: parsed.startedAt ?? Date.now(),
    }
  } catch {
    // Corrupt state must never block a child from playing.
    return empty()
  }
}

export function saveGuest(state: GuestState): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private mode). Play continues in memory.
  }
}

export function clearGuest(): void {
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.removeItem(GUEST_KEY) } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- guest`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guest tests/unit/guest
git commit -m "feat: add per-tab sessionStorage guest progress store"
```

---

## Task 11: Design system — tokens, self-hosted fonts, clay components

**Files:**
- Create: `src/app/globals.css`, `public/fonts/*.woff2`, `src/components/clay/Button.tsx`, `src/components/clay/Card.tsx`, `src/components/clay/WordTile.tsx`
- Test: `tests/unit/components/clay.test.tsx`

**Interfaces:**
- Consumes: `MIN_TARGET_PX`, `Word`.
- Produces:
  - `<ClayButton label? ariaLabel? icon? tone="primary"|"play"|"fun" onPress children? />` — always ≥ `MIN_TARGET_PX`
  - `<ClayCard>{children}</ClayCard>`
  - `<WordTile word showTricky? size="md"|"lg" />` — renders the word in Andika, hearts over `trickyIndices`

Design system comes from `ui-ux-pro-max`: Claymorphism style, palette (learning blue `#2563EB`, play yellow `#F59E0B`, fun pink `#EC4899` on `#EFF6FF`), spring motion. Two deliberate departures: **Andika** replaces the suggested body font because it is purpose-built for early literacy with unambiguous single-storey `a` and `g` — when the letterform is the lesson, it has to be right; and the tool's "Trust & Authority" landing pattern is discarded as off-domain for an app.

- [ ] **Step 1: Self-host the fonts**

```bash
mkdir -p public/fonts
# Resolve the current woff2 URLs, with a browser UA so Google serves woff2:
curl -sH 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' \
  'https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Baloo+2:wght@700' \
  | grep -o 'https://fonts.gstatic.com[^)]*\.woff2'
# Download each URL the command above prints into public/fonts/ as:
#   Andika-Regular.woff2, Andika-Bold.woff2, Baloo2-Bold.woff2
```

Both fonts are OFL-1.1; record that in `NOTICE` (Task 12). **Never link the Google CSS at runtime** — the app must work with no internet.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/components/clay.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { MIN_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!  // heart, tricky at index 1
const go = ALL.find((w) => w.text === 'go')!      // decodable, no hearts

describe('ClayButton', () => {
  it('meets the child touch target floor', () => {
    render(<ClayButton label="Play" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Play' })).toHaveStyle({
      minWidth: `${MIN_TARGET_PX}px`,
      minHeight: `${MIN_TARGET_PX}px`,
    })
  })

  it('calls onPress when tapped', async () => {
    const onPress = vi.fn()
    render(<ClayButton label="Play" onPress={onPress} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('exposes an accessible name even when it shows only an icon', () => {
    render(<ClayButton ariaLabel="Hear the word" icon onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hear the word' })).toBeInTheDocument()
  })

  it('is never draggable', () => {
    const { container } = render(<ClayButton label="Play" onPress={() => {}} />)
    expect(container.querySelector('button')!.getAttribute('draggable')).not.toBe('true')
  })
})

describe('WordTile', () => {
  it('renders the whole word', () => {
    render(<WordTile word={said} />)
    expect(screen.getByTestId('word-text')).toHaveTextContent('said')
  })

  it('marks the tricky grapheme with a heart on a heart word', () => {
    render(<WordTile word={said} showTricky />)
    expect(screen.getByTestId('tricky-1')).toBeInTheDocument()
  })

  it('marks nothing on a decodable word, because it is not tricky', () => {
    render(<WordTile word={go} showTricky />)
    expect(screen.queryByTestId(/^tricky-/)).toBeNull()
  })

  it('shows no hearts unless asked', () => {
    render(<WordTile word={said} />)
    expect(screen.queryByTestId(/^tricky-/)).toBeNull()
  })

  it('renders the word in Andika, the literacy typeface', () => {
    render(<WordTile word={said} />)
    expect(screen.getByTestId('word-text')).toHaveClass('font-word')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- clay`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the tokens**

Replace `src/app/globals.css`:

```css
@import "tailwindcss";

@font-face {
  font-family: 'Andika';
  src: url('/fonts/Andika-Regular.woff2') format('woff2');
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: 'Andika';
  src: url('/fonts/Andika-Bold.woff2') format('woff2');
  font-weight: 700; font-display: swap;
}
@font-face {
  font-family: 'Baloo 2';
  src: url('/fonts/Baloo2-Bold.woff2') format('woff2');
  font-weight: 700; font-display: swap;
}

@theme {
  --color-primary: #2563EB;
  --color-on-primary: #FFFFFF;
  --color-play: #F59E0B;
  --color-on-play: #0F172A;
  --color-fun: #EC4899;
  --color-background: #EFF6FF;
  --color-foreground: #0F172A;
  --color-card: #FFFFFF;
  --color-muted: #F1F5FD;
  --color-muted-foreground: #475569;
  --color-border: #E4ECFC;

  --font-word: 'Andika', system-ui, sans-serif;
  --font-display: 'Baloo 2', system-ui, sans-serif;

  --radius-clay: 20px;
  --shadow-clay: 0 8px 0 rgba(15,23,42,0.12), inset 0 -4px 8px rgba(15,23,42,0.06);
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-display);
}

/* Motion is meaning here, not decoration — but it is never required. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Write the components**

Create `src/components/clay/Button.tsx`:

```tsx
'use client'
import { motion } from 'motion/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { ReactNode } from 'react'

interface Props {
  label?: string
  ariaLabel?: string
  icon?: boolean
  tone?: 'primary' | 'play' | 'fun'
  onPress: () => void
  children?: ReactNode
}

const TONES = {
  primary: 'bg-primary text-on-primary',
  play: 'bg-play text-on-play',
  fun: 'bg-fun text-white',
} as const

export function ClayButton({
  label, ariaLabel, icon, tone = 'primary', onPress, children,
}: Props) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
      className={`${TONES[tone]} rounded-clay shadow-clay px-6 py-4
        text-2xl font-bold cursor-pointer select-none
        focus-visible:outline-4 focus-visible:outline-offset-4
        focus-visible:outline-fun`}
    >
      {children ?? (icon ? null : label)}
    </motion.button>
  )
}
```

Create `src/components/clay/WordTile.tsx`:

```tsx
import type { Word } from '@/lib/words/types'

interface Props {
  word: Word
  showTricky?: boolean
  size?: 'md' | 'lg'
}

/**
 * Renders a word in Andika, a typeface designed for literacy learners:
 * single-storey 'a' and 'g' match how children are taught to form letters.
 *
 * Hearts appear only on genuinely irregular graphemes. Decodable and
 * spelling-family words show no hearts, because they are not tricky, and
 * telling a child otherwise teaches them to distrust sounding out.
 */
export function WordTile({ word, showTricky = false, size = 'md' }: Props) {
  return (
    <span
      data-testid="word-text"
      className={`font-word font-bold inline-flex ${size === 'lg' ? 'text-6xl' : 'text-4xl'}`}
    >
      {word.graphemes.map((g, i) => (
        <span key={i} className="relative inline-block">
          {showTricky && word.trickyIndices.includes(i) && (
            <svg
              data-testid={`tricky-${i}`}
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="absolute -top-5 left-1/2 -translate-x-1/2 w-5 h-5 fill-fun"
            >
              <path d="M12 21s-7-4.7-9.3-8.6C1 9.5 2.6 6 6 6c2 0 3.2 1.1 4 2.2C10.8 7.1 12 6 14 6c3.4 0 5 3.5 3.3 6.4C19 16.3 12 21 12 21z" />
            </svg>
          )}
          {g}
        </span>
      ))}
    </span>
  )
}
```

Create `src/components/clay/Card.tsx`:

```tsx
import type { ReactNode } from 'react'

export function ClayCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card rounded-clay shadow-clay border-4 border-border p-6">
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- clay`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/clay src/app/globals.css public/fonts tests/unit/components
git commit -m "feat: add clay design system with Andika word rendering"
```

---

## Task 12: Audio generation and playback

**Files:**
- Create: `scripts/generate-audio.ts`, `src/lib/audio/manifest.ts`, `src/lib/audio/player.ts`, `public/audio/**`, `NOTICE`
- Test: `tests/unit/audio/manifest.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETS`.
- Produces: `PHRASES`, `type PhraseKey`, `wordAudioUrl(audioId: string): string`, `phraseAudioUrl(key: PhraseKey): string`, `useAudio(): { speak(url: string): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/audio/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manifest`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the manifest**

Create `src/lib/audio/manifest.ts`:

```ts
/**
 * Every instruction a child needs, as speech. A pre-reader must never be
 * blocked by text they cannot read.
 *
 * Nothing here tells a child they were wrong — a miss produces an
 * invitation to try again, never a correction.
 */
export const PHRASES = {
  findTheWord: 'Find the word',
  listen: 'Listen',
  tryAgain: 'Have another go',
  wellDone: 'Well done!',
  yourTurn: 'Your turn',
  buildTheWord: 'Build the word',
  swatTheWord: 'Swat the word',
  findThePair: 'Find the matching pair',
  coverTheWord: 'Cover the word on your card',
  findItInTheSentence: 'Find it in the sentence',
  keepLooking: 'Keep looking',
  allDone: 'All done! Great playing.',
} as const

export type PhraseKey = keyof typeof PHRASES

export const wordAudioUrl = (audioId: string) => `/audio/words/${audioId}.ogg`
export const phraseAudioUrl = (key: PhraseKey) => `/audio/phrases/${key}.ogg`
```

- [ ] **Step 4: Write the player**

Create `src/lib/audio/player.ts`:

```ts
'use client'
import { useCallback, useRef } from 'react'

/**
 * Plays a clip, cancelling any clip already playing, so a child who taps
 * twice hears one voice rather than two overlapping ones.
 *
 * Playback failure is silent: a missing clip or a browser autoplay block
 * must never stop a child from playing the game.
 */
export function useAudio() {
  const current = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (url: string) => {
    try {
      current.current?.pause()
      const audio = new Audio(url)
      current.current = audio
      await audio.play()
    } catch {
      // Autoplay blocked or clip missing — carry on silently.
    }
  }, [])

  return { speak }
}
```

- [ ] **Step 5: Write the generation script**

Create `scripts/generate-audio.ts`. It runs offline on a dev machine; its output is committed so the image build needs no TTS toolchain.

```ts
/**
 * Generates word and phrase audio with Piper, offline.
 *
 * Voice: en_GB/alba/medium — licensed CC BY 4.0, trained on the
 * University of Edinburgh datashare corpus. Attribution is in NOTICE.
 *
 * en_GB/jenny_dioco was evaluated and rejected: its model card states
 * only "License: See URL" with no readable terms, and we do not ship
 * audio from a voice whose licence cannot be verified.
 *
 * Usage:
 *   pip install piper-tts
 *   npx tsx scripts/generate-audio.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { DEFAULT_SETS } from '../src/lib/words/default-sets'
import { PHRASES } from '../src/lib/audio/manifest'

const VOICE = 'en_GB-alba-medium'
const OUT = 'public/audio'

function say(text: string, file: string) {
  if (existsSync(file)) return
  const wav = `${file}.wav`
  execFileSync('python3', ['-m', 'piper', '-m', VOICE, '-f', wav], { input: text })
  execFileSync('ffmpeg', ['-y', '-i', wav, '-c:a', 'libopus', '-b:a', '32k', file])
  rmSync(wav)
}

mkdirSync(`${OUT}/words`, { recursive: true })
mkdirSync(`${OUT}/phrases`, { recursive: true })

for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
  say(w.text, `${OUT}/words/${w.audioId}.ogg`)
}
for (const [key, text] of Object.entries(PHRASES)) {
  say(text, `${OUT}/phrases/${key}.ogg`)
}
console.log('Audio generated.')
```

- [ ] **Step 6: Generate the audio and write NOTICE**

```bash
pip install piper-tts
npx tsx scripts/generate-audio.ts
ls public/audio/words | wc -l   # expect 56
```

Create `NOTICE`:

```
Tricky Words bundles generated speech audio in public/audio/.

The audio was generated offline with Piper
(https://github.com/OHF-Voice/piper1-gpl) using the voice
en_GB/alba/medium, which is licensed under Creative Commons
Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)
and trained on data from the University of Edinburgh
(https://datashare.ed.ac.uk/handle/10283/3270).

Fonts in public/fonts/ are licensed under the SIL Open Font License 1.1:
  Andika   - SIL International
  Baloo 2  - Ek Type
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- manifest`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-audio.ts src/lib/audio public/audio NOTICE tests/unit/audio
git commit -m "feat: add offline-generated word audio and playback"
```

---

## Task 13: Listen & Find — the core game loop

**Files:**
- Create: `src/components/games/types.ts`, `src/components/games/ListenAndFind.tsx`
- Test: `tests/unit/games/listen-and-find.test.tsx`

**Interfaces:**
- Consumes: `Round`, `ClayButton`, `WordTile`, `useAudio`, `wordAudioUrl`, `phraseAudioUrl`.
- Produces: `interface GameProps { round: Round; onAnswer: (correct: boolean, prompted: boolean) => void }` and `<ListenAndFind {...GameProps} />`. **All seven games implement `GameProps` unchanged**, so the session runner treats them interchangeably.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/games/listen-and-find.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!
const go = ALL.find((w) => w.text === 'go')!

const round = (o: Partial<Round> = {}): Round => ({
  word: said, distractors: [go],
  support: supportFor(newProgress('said')), isFinal: false, ...o,
})

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

describe('ListenAndFind', () => {
  it('shows one button per choice', () => {
    render(<ListenAndFind round={round()} onAnswer={() => {}} />)
    expect(screen.getByRole('button', { name: 'said' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'go' })).toBeInTheDocument()
  })

  it('reports a correct answer as unprompted when no hint was used', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('reports as prompted after the child asks to hear the word again', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('does not end the round on a miss — the child gets another go', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'said' })).toBeEnabled()
  })

  it('treats a later correct answer as prompted once a miss has happened', async () => {
    const onAnswer = vi.fn()
    render(<ListenAndFind round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('never shows failure language', async () => {
    render(<ListenAndFind round={round()} onAnswer={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'try harder']) {
      expect(body).not.toContain(banned)
    }
  })

  it('shows the word up front at the errorless support level', () => {
    render(<ListenAndFind round={round()} onAnswer={() => {}} />)
    expect(screen.getByTestId('prompt-word')).toBeInTheDocument()
  })

  it('hides the up-front word once support has faded', () => {
    const faded = round({ support: supportFor({ ...newProgress('said'), box: 3 }) })
    render(<ListenAndFind round={faded} onAnswer={() => {}} />)
    expect(screen.queryByTestId('prompt-word')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listen-and-find`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the shared game interface**

Create `src/components/games/types.ts`:

```ts
import type { Round } from '@/lib/engine/session'

export interface GameProps {
  round: Round
  /**
   * Called once the round resolves.
   *
   * `prompted` is true if the child used a hint or missed at least once
   * before answering, which keeps the progress ladder honest about what
   * counts as unaided recall.
   */
  onAnswer: (correct: boolean, prompted: boolean) => void
}
```

- [ ] **Step 4: Write the game**

Create `src/components/games/ListenAndFind.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { useAudio } from '@/lib/audio/player'
import { wordAudioUrl, phraseAudioUrl } from '@/lib/audio/manifest'
import type { GameProps } from './types'

export function ListenAndFind({ round, onAnswer }: GameProps) {
  const { speak } = useAudio()
  const [prompted, setPrompted] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)

  const choices = useMemo(() => {
    const all = [round.word, ...round.distractors]
    // Deterministic shuffle keyed on the word, so a re-render never moves
    // the buttons under a child's finger mid-tap.
    return all
      .map((w, i) => ({ w, k: (w.text.charCodeAt(0) * 31 + i) % all.length }))
      .sort((a, b) => a.k - b.k)
      .map(({ w }) => w)
  }, [round])

  useEffect(() => {
    if (round.support.speakBeforeRound) speak(wordAudioUrl(round.word.audioId))
  }, [round, speak])

  function choose(id: string) {
    if (id === round.word.id) {
      speak(phraseAudioUrl('wellDone'))
      onAnswer(true, prompted)
      return
    }
    // A miss is an invitation, never a correction. The round stays open,
    // support becomes explicit, and nothing on screen says "wrong".
    setPrompted(true)
    setNudge('Have another go')
    speak(phraseAudioUrl('tryAgain'))
    window.setTimeout(() => speak(wordAudioUrl(round.word.audioId)), 700)
  }

  return (
    <div className="flex flex-col items-center gap-8 p-6">
      <ClayButton
        tone="play"
        ariaLabel="Hear the word again"
        onPress={() => {
          setPrompted(true)
          speak(wordAudioUrl(round.word.audioId))
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-10 h-10 fill-current">
          <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" />
        </svg>
      </ClayButton>

      {round.support.showWordBeforeRound && (
        <div data-testid="prompt-word">
          <WordTile word={round.word} showTricky size="lg" />
        </div>
      )}

      {nudge && (
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl text-muted-foreground"
          role="status"
        >
          {nudge}
        </motion.p>
      )}

      <div className="flex flex-wrap justify-center gap-6">
        {choices.map((w) => (
          <ClayButton key={w.id} tone="primary" ariaLabel={w.text} onPress={() => choose(w.id)}>
            <WordTile word={w} size="lg" />
          </ClayButton>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- listen-and-find`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/games tests/unit/games
git commit -m "feat: add Listen and Find core game loop"
```

---

## Task 14: Heart Word Builder

**Files:**
- Create: `src/components/games/HeartWordBuilder.tsx`
- Test: `tests/unit/games/heart-word-builder.test.tsx`

**Interfaces:**
- Consumes: `GameProps`, `Word.graphemes`, `Word.trickyIndices`.
- Produces: `<HeartWordBuilder {...GameProps} />`.

This is the orthographic-mapping activity — the highest-value game in the app per the research.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/games/heart-word-builder.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeartWordBuilder } from '@/components/games/HeartWordBuilder'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'

const said = DEFAULT_SETS.flatMap((s) => s.words).find((w) => w.text === 'said')!
// said = s / ai / d, tricky at index 1

const round = (): Round => ({
  word: said, distractors: [],
  support: supportFor(newProgress('said')), isFinal: false,
})

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

describe('HeartWordBuilder', () => {
  it('offers a tile for every grapheme in the word', () => {
    render(<HeartWordBuilder round={round()} onAnswer={() => {}} />)
    for (const g of said.graphemes) {
      expect(screen.getAllByRole('button', { name: g }).length).toBeGreaterThan(0)
    }
  })

  it('completes the word when graphemes are tapped in order', async () => {
    const onAnswer = vi.fn()
    render(<HeartWordBuilder round={round()} onAnswer={onAnswer} />)
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('is tap-only — no tile is draggable', () => {
    const { container } = render(<HeartWordBuilder round={round()} onAnswer={() => {}} />)
    for (const b of container.querySelectorAll('button')) {
      expect(b.getAttribute('draggable')).not.toBe('true')
    }
  })

  it('ignores an out-of-order tap instead of failing the child', async () => {
    const onAnswer = vi.fn()
    render(<HeartWordBuilder round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'd' })[0])
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByTestId('built')).toHaveTextContent('')
  })

  it('shows a heart over the tricky grapheme once it is placed', async () => {
    render(<HeartWordBuilder round={round()} onAnswer={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: 's' })[0])
    await userEvent.click(screen.getAllByRole('button', { name: 'ai' })[0])
    expect(screen.getByTestId('tricky-1')).toBeInTheDocument()
  })

  it('marks the answer prompted once the child has heard the word', async () => {
    const onAnswer = vi.fn()
    render(<HeartWordBuilder round={round()} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    for (const g of said.graphemes) {
      await userEvent.click(screen.getAllByRole('button', { name: g })[0])
    }
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- heart-word-builder`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/games/HeartWordBuilder.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { ClayButton } from '@/components/clay/Button'
import { useAudio } from '@/lib/audio/player'
import { wordAudioUrl, phraseAudioUrl } from '@/lib/audio/manifest'
import type { GameProps } from './types'

const DECOYS = ['b', 'ee', 'k', 'oo', 'p', 'sh', 't', 'ay']

/**
 * The orthographic-mapping activity: the child builds the word grapheme
 * by grapheme, and the irregular part is marked with a heart as it lands.
 *
 * Tapping the wrong tile does nothing at all — no penalty, no message.
 * Doing nothing is the gentlest possible correction, and it keeps a child
 * exploring rather than guarding against mistakes.
 */
export function HeartWordBuilder({ round, onAnswer }: GameProps) {
  const { speak } = useAudio()
  const [placed, setPlaced] = useState(0)
  const [prompted, setPrompted] = useState(false)

  const tiles = useMemo(() => {
    const needed = round.word.graphemes
    const extras = DECOYS.filter((d) => !needed.includes(d)).slice(0, 3)
    return [...needed, ...extras].sort((a, b) => a.localeCompare(b))
  }, [round])

  function tap(g: string) {
    if (g !== round.word.graphemes[placed]) return
    const next = placed + 1
    setPlaced(next)
    if (next === round.word.graphemes.length) {
      speak(wordAudioUrl(round.word.audioId))
      window.setTimeout(() => speak(phraseAudioUrl('wellDone')), 600)
      onAnswer(true, prompted)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 p-6">
      <ClayButton
        tone="play"
        ariaLabel="Hear the word"
        onPress={() => { setPrompted(true); speak(wordAudioUrl(round.word.audioId)) }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-10 h-10 fill-current">
          <path d="M3 10v4h4l5 5V5L7 10H3z" />
        </svg>
      </ClayButton>

      <div
        data-testid="built"
        className="font-word font-bold text-6xl min-h-24 flex items-end gap-1"
      >
        {round.word.graphemes.slice(0, placed).map((g, i) => (
          <span key={i} className="relative inline-block">
            {round.word.trickyIndices.includes(i) && (
              <svg
                data-testid={`tricky-${i}`}
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="absolute -top-8 left-1/2 -translate-x-1/2 w-7 h-7 fill-fun"
              >
                <path d="M12 21s-7-4.7-9.3-8.6C1 9.5 2.6 6 6 6c2 0 3.2 1.1 4 2.2C10.8 7.1 12 6 14 6c3.4 0 5 3.5 3.3 6.4C19 16.3 12 21 12 21z" />
              </svg>
            )}
            {g}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        {tiles.map((g, i) => (
          <ClayButton key={`${g}-${i}`} tone="primary" ariaLabel={g} onPress={() => tap(g)}>
            <span className="font-word font-bold text-4xl">{g}</span>
          </ClayButton>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- heart-word-builder`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/games/HeartWordBuilder.tsx tests/unit/games/heart-word-builder.test.tsx
git commit -m "feat: add Heart Word Builder orthographic mapping game"
```

---

## Task 15: The remaining five games

Each implements the identical `GameProps` from Task 13, so the session runner treats all seven interchangeably. Build them one at a time, running the shared test after each.

**Files:**
- Create: `src/components/games/WordSwat.tsx`, `MemoryPairs.tsx`, `Bingo.tsx`, `WordSpotter.tsx`, `TreasureHunt.tsx`, `src/components/games/index.ts`
- Test: `tests/unit/games/all-games.test.tsx`

**Interfaces:**
- Consumes: `GameProps`, `ClayButton`, `WordTile`, `useAudio`, `wordAudioUrl`, `phraseAudioUrl`.
- Produces:
  - `type GameId = 'listen-and-find' | 'heart-word-builder' | 'word-swat' | 'memory-pairs' | 'bingo' | 'word-spotter' | 'treasure-hunt'`
  - `const GAMES: Record<GameId, ComponentType<GameProps>>`
  - `const GAME_LABELS: Record<GameId, string>`

- [ ] **Step 1: Write the shared behavioural test**

Every game must obey the same non-negotiables, so one test covers all seven. Create `tests/unit/games/all-games.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GAMES } from '@/components/games'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { Round } from '@/lib/engine/session'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const round: Round = {
  word: ALL.find((w) => w.text === 'said')!,
  distractors: [
    ALL.find((w) => w.text === 'go')!,
    ALL.find((w) => w.text === 'the')!,
    ALL.find((w) => w.text === 'my')!,
  ],
  support: supportFor({ ...newProgress('said'), box: 3 }),
  isFinal: false,
}

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

describe.each(Object.entries(GAMES))('game: %s', (_name, Game) => {
  it('renders without crashing', () => {
    render(<Game round={round} onAnswer={() => {}} />)
    expect(document.body.textContent).not.toBe('')
  })

  it('never shows failure language', () => {
    render(<Game round={round} onAnswer={() => {}} />)
    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'failed', 'you lose', 'game over']) {
      expect(body).not.toContain(banned)
    }
  })

  it('makes every interactive element big enough for small fingers', () => {
    const { container } = render(<Game round={round} onAnswer={() => {}} />)
    for (const b of container.querySelectorAll('button')) {
      const min = parseInt((b as HTMLElement).style.minWidth || '0', 10)
      expect(min).toBeGreaterThanOrEqual(MIN_TARGET_PX)
    }
  })

  it('introduces no drag interaction', () => {
    const { container } = render(<Game round={round} onAnswer={() => {}} />)
    expect(container.querySelector('[draggable="true"]')).toBeNull()
  })

  it('gives every button an accessible name', () => {
    render(<Game round={round} onAnswer={() => {}} />)
    for (const b of screen.queryAllByRole('button')) {
      expect(b).toHaveAccessibleName()
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- all-games`
Expected: FAIL — `@/components/games` has no `GAMES` export.

- [ ] **Step 3: Write Word Swat**

`src/components/games/WordSwat.tsx` — builds automaticity.

- Words from `[round.word, ...round.distractors]` drift across the play area using CSS `transform` only (never `left`/`top` — those force layout).
- The child taps the called word to swat it.
- **No timer that can run out.** Words wrap around forever until the target is swatted. There is no losing condition anywhere.
- A wrong swat sets `prompted`, plays `tryAgain`, and leaves the round open — the same semantics as `ListenAndFind`.
- Under `prefers-reduced-motion`, render the words in a static grid instead of animating them. Use `window.matchMedia('(prefers-reduced-motion: reduce)')`.
- Every swattable word is a `ClayButton` so it inherits the 76px floor and accessible name.

- [ ] **Step 4: Write Memory Pairs**

`src/components/games/MemoryPairs.tsx` — recognition under load.

- A 2×3 grid of face-down cards holding three word pairs drawn from `round.word` plus `round.distractors`.
- **Tap one card, tap another.** Never drag — NN/g research shows 5-7 year olds struggle badly with precise dragging.
- A non-matching pair flips back after 900ms with no message and no penalty.
- `onAnswer(true, prompted)` fires when the pair containing `round.word` is matched.
- Each card is a `ClayButton` with `ariaLabel` of either "Face down card" or the revealed word.

- [ ] **Step 5: Write Bingo**

`src/components/games/Bingo.tsx` — sustained listening.

- A 3×3 card of words including `round.word`, padded from `round.distractors` and the wider set.
- Audio calls a word; the child taps it to cover it.
- Tapping an uncalled word does nothing — no penalty.
- `onAnswer(true, prompted)` when `round.word` is covered.

- [ ] **Step 6: Write Word Spotter**

`src/components/games/WordSpotter.tsx` — transfer to connected text.

- Renders `round.word.sentences[0]` as **real prose**, not a word list, with each word its own ≥76px tap target in Andika.
- The child taps the target word inside the sentence.
- A wrong tap sets `prompted`, plays `tryAgain`, leaves the round open.
- This is the only game where the word appears in context, which is what makes it the transfer activity — keep the sentence reading naturally.

- [ ] **Step 7: Write Treasure Hunt**

`src/components/games/TreasureHunt.tsx` — ties the map together.

- Three chests; one hides the called word.
- Tapping a chest opens it to reveal a word.
- Finding `round.word` fires `onAnswer(true, prompted)`.
- Wrong chests reveal a friendly original character saying "Keep looking" — never a penalty, never an empty chest that reads as failure.

- [ ] **Step 8: Write the registry**

Create `src/components/games/index.ts`:

```ts
import type { ComponentType } from 'react'
import type { GameProps } from './types'
import { ListenAndFind } from './ListenAndFind'
import { HeartWordBuilder } from './HeartWordBuilder'
import { WordSwat } from './WordSwat'
import { MemoryPairs } from './MemoryPairs'
import { Bingo } from './Bingo'
import { WordSpotter } from './WordSpotter'
import { TreasureHunt } from './TreasureHunt'

export type GameId =
  | 'listen-and-find' | 'heart-word-builder' | 'word-swat'
  | 'memory-pairs' | 'bingo' | 'word-spotter' | 'treasure-hunt'

export const GAMES: Record<GameId, ComponentType<GameProps>> = {
  'listen-and-find': ListenAndFind,
  'heart-word-builder': HeartWordBuilder,
  'word-swat': WordSwat,
  'memory-pairs': MemoryPairs,
  'bingo': Bingo,
  'word-spotter': WordSpotter,
  'treasure-hunt': TreasureHunt,
}

export const GAME_LABELS: Record<GameId, string> = {
  'listen-and-find': 'Listen and Find',
  'heart-word-builder': 'Build the Word',
  'word-swat': 'Word Swat',
  'memory-pairs': 'Memory Pairs',
  'bingo': 'Bingo',
  'word-spotter': 'Spot the Word',
  'treasure-hunt': 'Treasure Hunt',
}

export type { GameProps }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- all-games`
Expected: PASS (35 tests — 5 assertions × 7 games).

- [ ] **Step 10: Commit**

```bash
git add src/components/games tests/unit/games
git commit -m "feat: add remaining five games behind a shared interface"
```

---

## Task 16: Companion, progress map and sticker book

**Files:**
- Create: `src/lib/rewards.ts`, `src/components/companion/Companion.tsx`, `src/components/map/ProgressMap.tsx`, `src/components/stickers/StickerBook.tsx`
- Test: `tests/unit/rewards.test.ts`, `tests/unit/components/companion.test.tsx`

**Interfaces:**
- Consumes: `WordProgress`, `WordSet`, `isSetComplete`.
- Produces:
  - `COMPANION_THRESHOLDS = [0, 5, 15, 30, 45]`, `type CompanionStage = 0|1|2|3|4`
  - `companionStage(knownCount: number): CompanionStage`
  - `stickersEarned(knownCount: number): string[]`
  - `<Companion stage />`, `<ProgressMap sets progress onPickSet />`, `<StickerBook stickers />`

**Original art constraint:** the companion is a simple original SVG creature built from circles, ellipses and paths, drawn for this project. It must not resemble the characters of any commercial reading product. Do not copy, trace, or reproduce any existing character.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rewards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { companionStage, stickersEarned, COMPANION_THRESHOLDS } from '@/lib/rewards'

describe('companion growth', () => {
  it('grows at 0, 5, 15, 30 and 45 known words', () => {
    expect([...COMPANION_THRESHOLDS]).toEqual([0, 5, 15, 30, 45])
  })

  it('advances a stage at each threshold', () => {
    expect(companionStage(0)).toBe(0)
    expect(companionStage(4)).toBe(0)
    expect(companionStage(5)).toBe(1)
    expect(companionStage(15)).toBe(2)
    expect(companionStage(30)).toBe(3)
    expect(companionStage(45)).toBe(4)
  })

  it('never exceeds the final stage, even beyond all 56 words', () => {
    expect(companionStage(56)).toBe(4)
    expect(companionStage(999)).toBe(4)
  })

  it('never shrinks as the child learns more', () => {
    for (let i = 1; i <= 56; i++) {
      expect(companionStage(i)).toBeGreaterThanOrEqual(companionStage(i - 1))
    }
  })
})

describe('stickers', () => {
  it('awards nothing at zero', () => {
    expect(stickersEarned(0)).toEqual([])
  })

  it('awards more stickers as more words are known', () => {
    expect(stickersEarned(20).length).toBeGreaterThan(stickersEarned(5).length)
  })

  it('never awards duplicates', () => {
    const s = stickersEarned(56)
    expect(new Set(s).size).toBe(s.length)
  })

  it('never takes a sticker away', () => {
    for (let i = 1; i <= 56; i++) {
      expect(stickersEarned(i).length).toBeGreaterThanOrEqual(stickersEarned(i - 1).length)
    }
  })
})
```

Create `tests/unit/components/companion.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Companion } from '@/components/companion/Companion'

describe('Companion', () => {
  it('is announced to screen readers as a labelled image', () => {
    render(<Companion stage={0} />)
    expect(screen.getByRole('img')).toHaveAccessibleName()
  })

  it('renders every growth stage without crashing', () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const { unmount } = render(<Companion stage={stage} />)
      expect(screen.getByRole('img')).toBeInTheDocument()
      unmount()
    }
  })

  it('shows more detail as it grows', () => {
    const { container: small, unmount } = render(<Companion stage={0} />)
    const smallCount = small.querySelectorAll('svg *').length
    unmount()
    const { container: big } = render(<Companion stage={4} />)
    expect(big.querySelectorAll('svg *').length).toBeGreaterThan(smallCount)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rewards companion`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the rewards logic**

Create `src/lib/rewards.ts`:

```ts
export const COMPANION_THRESHOLDS = [0, 5, 15, 30, 45] as const
export type CompanionStage = 0 | 1 | 2 | 3 | 4

const STICKERS = [
  'seed', 'sprout', 'leaf', 'bud', 'flower', 'star',
  'moon', 'sun', 'cloud', 'rainbow', 'kite', 'crown',
]

/** The companion only ever grows. Nothing a child does makes it shrink. */
export function companionStage(knownCount: number): CompanionStage {
  let stage = 0
  COMPANION_THRESHOLDS.forEach((t, i) => { if (knownCount >= t) stage = i })
  return stage as CompanionStage
}

/** One sticker per five words known, capped at the sticker sheet size. */
export function stickersEarned(knownCount: number): string[] {
  return STICKERS.slice(0, Math.min(STICKERS.length, Math.floor(knownCount / 5)))
}
```

- [ ] **Step 4: Write the components**

`src/components/companion/Companion.tsx` — an original SVG creature in five stages. Stage 0 is a small round body with two eyes; each later stage adds one original feature (a tuft, then arms, then a tail, then a small crown of leaves). Build from `<circle>`, `<ellipse>` and `<path>`. Give the `<svg>` `role="img"` and a stage-appropriate `aria-label`, e.g. `"Your friend has grown a little"`.

`src/components/map/ProgressMap.tsx` — 12 islands on a winding path, one per set. A completed set shows a filled island; the current set pulses gently (respecting `prefers-reduced-motion`); locked sets are dimmed with `aria-disabled` and, on tap, play a spoken explanation rather than doing nothing silently. Each island is a ≥76px target.

`src/components/stickers/StickerBook.tsx` — a grid of sticker slots; earned ones filled with original SVG, unearned ones shown as soft outlines so a child can see what is still to come.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- rewards companion`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rewards.ts src/components/companion src/components/map src/components/stickers tests/unit
git commit -m "feat: add original companion, progress map and sticker book"
```

---

## Task 17: Session runner and family routes

**Files:**
- Create: `src/components/SessionRunner.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`, `src/app/api/progress/route.ts`, `src/app/api/profiles/route.ts`
- Test: `tests/unit/components/session-runner.test.tsx`

**Interfaces:**
- Consumes: `planSession`, `GAMES`, `GameId`, `recordCorrect`, `recordMiss`, `applyStruggleRules`, `decrementDue`, `Companion`, `stickersEarned`.
- Produces: `<SessionRunner words initialProgress onProgressChange onComplete sessionLength? />` where `onProgressChange: (p: WordProgress) => void` and `onComplete: (all: Map<string, WordProgress>) => void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/session-runner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'

const WORDS = DEFAULT_SETS[0].words

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

const props = () => ({
  words: WORDS,
  initialProgress: new Map(WORDS.map((w) => [w.id, newProgress(w.id)])),
  onProgressChange: vi.fn(),
  onComplete: vi.fn(),
})

describe('SessionRunner', () => {
  it('starts on the first round', () => {
    render(<SessionRunner {...props()} />)
    expect(screen.getByTestId('round-counter')).toHaveTextContent('1')
  })

  it('never shows a score or a correct/incorrect tally', () => {
    render(<SessionRunner {...props()} />)
    const body = document.body.textContent!.toLowerCase()
    expect(body).not.toMatch(/score|points|\d+\s*\/\s*\d+\s*correct/)
  })

  it('reports progress upward after an answer', async () => {
    const p = props()
    // Seed 'my' as the strongest word so it is the single (final) round,
    // which makes the button to click deterministic.
    const start = new Map(p.initialProgress)
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known' })
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    await waitFor(() => expect(p.onProgressChange).toHaveBeenCalled())
  })

  it('calls onComplete once the last round resolves', async () => {
    const p = props()
    const start = new Map(p.initialProgress)
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known' })
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    await waitFor(() => expect(p.onComplete).toHaveBeenCalled())
  })

  it('decrements the due countdown once per session, not per round', async () => {
    const p = props()
    const start = new Map(p.initialProgress)
    // 'my' is strongest, so it is the only round played. 'the' is never
    // answered, so its countdown can only move via the end-of-session
    // decrement -- which is exactly what this test is checking.
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known' })
    start.set('the', { ...start.get('the')!, box: 3, dueInSessions: 4 })
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    await waitFor(() => expect(p.onComplete).toHaveBeenCalled())
    const final = p.onComplete.mock.calls[0][0] as Map<string, ReturnType<typeof newProgress>>
    expect(final.get('the')!.dueInSessions).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session-runner`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the session runner**

Create `src/components/SessionRunner.tsx`. Responsibilities, in this order:

1. Call `planSession({ words, progress: initialProgress, length: sessionLength })` **once on mount** (store the plan in state; do not re-plan on every render or the rounds will shuffle under the child).
2. Choose a game per round: rotate through `Object.keys(GAMES)` so a session varies, **except** that a round whose word is `struggling` always uses `listen-and-find`, the most supportive game.
3. Render the chosen game with the round and a `data-testid="round-counter"` showing the 1-based round number.
4. On `onAnswer(correct, prompted)`: apply `recordCorrect`/`recordMiss`, then `applyStruggleRules`, call `onProgressChange(next)`, and advance to the next round.
5. After the final round: apply `decrementDue` to **every** word's progress exactly once — this is what makes the ladder session-based rather than round-based — then call `onComplete(allProgress)`.
6. Show a celebration screen with the `Companion` and any newly earned sticker. **No score, no percentage, no correct/incorrect tally** — the celebration is for finishing, not for performance.

- [ ] **Step 4: Write the API routes**

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { resolveMode } from '@/lib/mode'
import { APP_NAME } from '@/lib/constants'

export async function GET() {
  return NextResponse.json({ app: APP_NAME, mode: resolveMode(process.env), ok: true })
}
```

Create `src/app/api/progress/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { saveProgress } from '@/lib/db/progress'

export async function POST(req: Request) {
  // Public mode makes no writes of any kind.
  if (isPublicMode()) return new NextResponse('Not found', { status: 404 })
  const { profileId, progress } = await req.json()
  saveProgress(getDb(), Number(profileId), progress)
  return NextResponse.json({ ok: true })
}
```

Create `src/app/api/profiles/route.ts` — `GET` lists profiles, `POST` creates one, `DELETE` removes one. Every handler returns 404 in public mode, using the same guard.

Create `src/app/page.tsx` — the family home. Lists profiles as large tap targets with their avatar, offers "Add someone", and links to the parent area. In public mode it redirects to `/play`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- session-runner`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/SessionRunner.tsx src/app tests/unit/components/session-runner.test.tsx
git commit -m "feat: add session runner and family routes"
```

---

## Task 18: Parent area behind a PIN

**Files:**
- Create: `src/lib/parent/pin.ts`, `src/app/parent/page.tsx`, `src/app/api/parent/route.ts`
- Test: `tests/unit/parent/pin.test.ts`

**Interfaces:**
- Consumes: `getSetting`, `setSetting`.
- Produces: `hashPin(pin: string): string`, `verifyPin(pin: string, stored: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/parent/pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin } from '@/lib/parent/pin'

describe('parent PIN', () => {
  it('never stores the PIN in clear text', () => {
    const hash = hashPin('1234')
    expect(hash).not.toContain('1234')
    expect(hash.length).toBeGreaterThan(20)
  })

  it('verifies the right PIN', () => {
    expect(verifyPin('1234', hashPin('1234'))).toBe(true)
  })

  it('rejects the wrong PIN', () => {
    expect(verifyPin('9999', hashPin('1234'))).toBe(false)
  })

  it('salts, so the same PIN does not produce the same hash twice', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'))
  })

  it('rejects a malformed stored value rather than throwing', () => {
    expect(verifyPin('1234', 'not-a-hash')).toBe(false)
  })

  it('rejects a non-numeric or short PIN when it is set', () => {
    expect(() => hashPin('12')).toThrow()
    expect(() => hashPin('abcd')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pin`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/parent/pin.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * The parent PIN is a CHILD GATE, not authentication.
 *
 * It exists to stop a six-year-old wandering into settings and deleting
 * their sibling's progress. It is not designed to resist an adult
 * attacker, and the README says so plainly. The real security boundary
 * is the network: family mode belongs on a LAN or behind a VPN.
 *
 * It is still salted and hashed, because storing any secret in clear
 * text teaches the wrong habit and costs nothing to avoid.
 */
export function hashPin(pin: string): string {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits')
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const derived = scryptSync(pin, Buffer.from(saltHex, 'hex'), 32)
    const expected = Buffer.from(hashHex, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Build the parent area**

`src/app/parent/page.tsx` must:

- call `notFound()` immediately in public mode, so the route does not exist there
- prompt for the PIN, with a first-run flow that sets one (stored via `setSetting(db, 'pinHash', ...)`)
- show, per child: each word with its stage, box, attempts and lapses, and a plain-language note for struggling words — *"This one keeps slipping, so it's back on easy mode"* — not a raw number a parent has to interpret
- allow adding, editing, reordering and deleting word sets, writing them to `data/word-sets.json` (the file the public container mounts read-only)
- allow recording a parent voice per word via `MediaRecorder`, stored in the data volume
- allow creating and deleting child profiles
- state on screen, visibly: *"This PIN keeps little hands out of the settings. It is not a password — keep Tricky Words on your home network."*

`src/app/api/parent/route.ts` handles PIN verification and set editing, returning 404 in public mode.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pin`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/parent src/app/parent src/app/api/parent tests/unit/parent
git commit -m "feat: add PIN-gated parent area with per-word progress"
```

---

## Task 19: Public guest mode

**Files:**
- Create: `src/app/play/page.tsx`, `src/components/guest/GuestHome.tsx`, `src/middleware.ts`
- Test: `tests/unit/guest/guest-home.test.tsx`

**Interfaces:**
- Consumes: `loadGuest`, `saveGuest`, `clearGuest`, `SessionRunner`, `DEFAULT_SETS`, `Companion`.
- Produces: `<GuestHome sets />`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/guest/guest-home.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { loadGuest, saveGuest } from '@/lib/guest/store'

beforeEach(() => {
  sessionStorage.clear()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
})

describe('GuestHome', () => {
  it('never asks a child for their name', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/name/i)).toBeNull()
  })

  it('offers avatars to pick instead', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getAllByTestId(/^avatar-/).length).toBeGreaterThan(2)
  })

  it('remembers the chosen avatar for this tab', async () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getAllByTestId(/^avatar-/)[0])
    expect(loadGuest().avatar).not.toBeNull()
  })

  it('offers Start again for the next child on a shared device', async () => {
    saveGuest({ avatar: 'fox', progress: {}, stickers: ['star'], startedAt: 1 })
    render(<GuestHome sets={DEFAULT_SETS} />)
    await userEvent.click(screen.getByRole('button', { name: /start again/i }))
    expect(loadGuest().avatar).toBeNull()
  })

  it('tells the visitor plainly that progress is not kept', () => {
    render(<GuestHome sets={DEFAULT_SETS} />)
    expect(screen.getByText(/this device|this visit|not saved/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guest-home`
Expected: FAIL — module not found.

- [ ] **Step 3: Write GuestHome**

Create `src/components/guest/GuestHome.tsx`. Requirements:

- **Never renders a text input.** A child on a public site is never asked for a name, an age, or anything else. Avatar choice only, from original SVG animal shapes, each a ≥76px target with an `aria-label` and `data-testid={`avatar-${id}`}`.
- Reads and writes only through `loadGuest`/`saveGuest` — **no server call, ever**.
- Shows a plain honesty line: *"Your stickers stay on this device, just for this visit."*
- A prominent **Start again** button calling `clearGuest()` and resetting local state.
- A set chooser that honours `?set=N` from the URL, so `/play?set=3` drops a class straight into set 3.
- Companion and sticker sheet scoped to the single-session arc from the spec.

Create `src/app/play/page.tsx` — the public entry point. It works in both modes (a family can use it too), but in public mode it is the *only* entry point.

- [ ] **Step 4: Write the middleware**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { resolveMode } from '@/lib/mode'

const FAMILY_ONLY = ['/parent', '/api/parent', '/api/progress', '/api/profiles']

/**
 * In public mode the family surface does not exist.
 *
 * This is defence in depth, not the primary control. The primary control
 * is that a public deployment mounts no data volume, so there is no
 * family database in the container to serve in the first place. Both
 * must hold: a guard can be bypassed by a bug, absent data cannot.
 */
export function middleware(req: NextRequest) {
  if (resolveMode(process.env) !== 'public') return NextResponse.next()
  const path = req.nextUrl.pathname
  if (FAMILY_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) {
    return new NextResponse('Not found', { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- guest-home`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the whole unit suite and commit**

```bash
npm test && npm run typecheck
git add src/app/play src/components/guest src/middleware.ts tests/unit/guest
git commit -m "feat: add public guest mode with no names and no writes"
```

---

## Task 20: End-to-end tests

**Files:**
- Create: `playwright.config.ts`, `scripts/seed-demo.ts`, `tests/e2e/public-mode.spec.ts`, `tests/e2e/family.spec.ts`, `tests/e2e/games.spec.ts`
- Modify: `package.json` (add `test:e2e`)

**Interfaces:**
- Consumes: the running app.
- Produces: `npm run test:e2e`; a seeded demo database at `./data/demo.db` holding profiles `Robin` and `Sam` with PIN `1234`.

**Invoke the `playwright-skill`** for this task rather than hand-rolling browser automation.

- [ ] **Step 1: Install Playwright**

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

Add `"test:e2e": "playwright test"` to `package.json` scripts.

- [ ] **Step 2: Write the demo seed**

Create `scripts/seed-demo.ts` creating `./data/demo.db` with:

- profiles `Robin` (avatar `fox`) and `Sam` (avatar `owl`) — **invented names only**
- partial progress for Robin: sets 1–2 mostly `known`, one word (`where`) flagged `struggling` so the parent view has something real to show
- PIN hash for `1234`

- [ ] **Step 3: Write the public-mode isolation spec**

This is the highest-value E2E test in the project — it proves the privacy claim the README makes. Create `tests/e2e/public-mode.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('public mode', () => {
  test('does not serve the parent area', async ({ page }) => {
    const res = await page.goto('/parent')
    expect(res?.status()).toBe(404)
  })

  test('does not accept progress writes', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: { profileId: 1, progress: {} },
    })
    expect(res.status()).toBe(404)
  })

  test('does not serve the profiles API', async ({ request }) => {
    expect((await request.get('/api/profiles')).status()).toBe(404)
  })

  test('reports public mode on the health endpoint', async ({ request }) => {
    const body = await (await request.get('/api/health')).json()
    expect(body.mode).toBe('public')
  })

  test('never asks a child for a name', async ({ page }) => {
    await page.goto('/play')
    await expect(page.locator('input[type="text"]')).toHaveCount(0)
  })

  test('exposes no child profile name anywhere in the served HTML', async ({ page }) => {
    await page.goto('/play')
    const html = await page.content()
    for (const name of ['Robin', 'Sam', 'Alex']) {
      expect(html).not.toContain(name)
    }
  })

  test('keeps guest progress per tab and clears it on Start again', async ({ page }) => {
    await page.goto('/play')
    await page.getByTestId(/^avatar-/).first().click()
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .not.toBeNull()

    await page.reload()
    // A fumbled pull-to-refresh must not wipe a child's game.
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .not.toBeNull()

    await page.getByRole('button', { name: /start again/i }).click()
    expect(await page.evaluate(() => sessionStorage.getItem('trickywords.guest')))
      .toBeNull()
  })

  test('gives two tabs independent progress, so guests never collide', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/play')
    await b.goto('/play')
    await a.getByTestId(/^avatar-/).first().click()
    expect(await b.evaluate(() => sessionStorage.getItem('trickywords.guest'))).toBeNull()
  })

  test('sets no cookies', async ({ page, context }) => {
    await page.goto('/play')
    expect(await context.cookies()).toHaveLength(0)
  })

  test('makes no external network requests', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const host = new URL(r.url()).hostname
      if (!['localhost', '127.0.0.1'].includes(host)) external.push(r.url())
    })
    await page.goto('/play')
    await page.waitForLoadState('networkidle')
    expect(external).toEqual([])
  })

  test('honours a shared set link', async ({ page }) => {
    await page.goto('/play?set=3')
    await expect(page.getByText(/set 3/i)).toBeVisible()
  })
})
```

- [ ] **Step 4: Write the family spec**

Create `tests/e2e/family.spec.ts` covering: create a profile; play a full session; progress persists across a reload; open the parent area with PIN `1234`; wrong PIN is refused; per-word progress and the struggling note are visible; add a word set; delete a profile and confirm its progress is gone.

- [ ] **Step 5: Write the games spec**

Create `tests/e2e/games.spec.ts`: for each of the seven `GameId` values, play one round to completion, assert a celebration appears, and assert no failure language is present anywhere on the page.

- [ ] **Step 6: Configure Playwright with two projects**

Create `playwright.config.ts` with two projects, each with its own `webServer` so the isolation tests run against a genuinely public-mode server:

- `family` — `TRICKYWORDS_MODE=family`, `TRICKYWORDS_DB=./data/demo.db`, seeded first, port 3000, runs `family.spec.ts` and `games.spec.ts`
- `public` — `TRICKYWORDS_MODE=public`, **no `TRICKYWORDS_DB`**, port 3001, runs `public-mode.spec.ts`

- [ ] **Step 7: Run and commit**

```bash
npx tsx scripts/seed-demo.ts
npm run test:e2e
git add playwright.config.ts tests/e2e scripts/seed-demo.ts package.json
git commit -m "test: add E2E coverage including public-mode isolation"
```

---

## Task 21: Docker image and compose files

**Files:**
- Create: `docker/Dockerfile`, `docker/docker-compose.yml`, `docker/docker-compose.public.yml`, `.dockerignore`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: the built app.
- Produces: an image exposing port 3000, with `/app/data` as the data volume and `/api/health` for healthchecks.

- [ ] **Step 1: Set standalone output**

`next.config.ts`:

```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = { output: 'standalone' }
export default nextConfig
```

Create `.dockerignore` with `node_modules`, `.next`, `data`, `.git`, `test-results`, `playwright-report`.

- [ ] **Step 2: Write the Dockerfile**

Create `docker/Dockerfile` — multi-stage, non-root, `better-sqlite3` compiled for the target arch:

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci \
 && rm -rf /var/lib/apt/lists/*

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    TRICKYWORDS_MODE=family \
    TRICKYWORDS_DB=/app/data/trickywords.db \
    PORT=3000
RUN useradd -m -u 1001 trickywords \
 && mkdir -p /app/data \
 && chown -R trickywords /app
COPY --from=build --chown=trickywords /app/.next/standalone ./
COPY --from=build --chown=trickywords /app/.next/static ./.next/static
COPY --from=build --chown=trickywords /app/public ./public
USER trickywords
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write the family compose file**

Create `docker/docker-compose.yml`:

```yaml
# Family install. LAN or VPN only - do not expose this to the internet.
# This container holds children's names, their progress, and any voice
# recordings a parent has made. Use docker-compose.public.yml for a
# public address.
services:
  trickywords:
    image: ghcr.io/the-kizz/trickywords:latest
    container_name: trickywords
    restart: unless-stopped
    environment:
      TRICKYWORDS_MODE: family
      TZ: Etc/UTC
    ports:
      - "3000:3000"
    volumes:
      - trickywords_data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  trickywords_data:
```

- [ ] **Step 4: Write the public compose file**

Create `docker/docker-compose.public.yml`. **The critical line is the absence of a data volume:**

```yaml
# Public install. Safe to put on a public subdomain.
#
# There is NO data volume here, and that is the whole security model:
# no family database exists in this container, so there is nothing for a
# bug in the app to leak. Word sets flow one way only - read-only, out of
# the family install.
services:
  trickywords-public:
    image: ghcr.io/the-kizz/trickywords:latest
    container_name: trickywords-public
    restart: unless-stopped
    environment:
      TRICKYWORDS_MODE: public
    ports:
      - "3001:3000"
    volumes:
      - ./word-sets.json:/app/data/word-sets.json:ro
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

- [ ] **Step 5: Build and verify both modes locally**

```bash
docker build -f docker/Dockerfile -t trickywords:dev .

docker run --rm -d -p 3000:3000 --name tw-fam trickywords:dev
curl -fsS http://127.0.0.1:3000/api/health          # expect "mode":"family"

docker run --rm -d -p 3001:3000 -e TRICKYWORDS_MODE=public --name tw-pub trickywords:dev
curl -fsS http://127.0.0.1:3001/api/health          # expect "mode":"public"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/parent   # expect 404

docker rm -f tw-fam tw-pub
```

Record the actual output. Do not proceed if the 404 does not appear.

- [ ] **Step 6: Commit**

```bash
git add docker .dockerignore next.config.ts
git commit -m "feat: add Docker image and family/public compose files"
```

---

## Task 22: CI and multi-arch release

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/edge.yml`

**Interfaces:**
- Consumes: the repo.
- Produces: `ghcr.io/the-kizz/trickywords` with tags `:latest`, `:edge`, `:1`, `:1.0`, `:1.0.0`.

- [ ] **Step 1: Write CI**

`.github/workflows/ci.yml` — on pull request and push to `main`: checkout, Node 22, `npm ci`, `npm run typecheck`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, then a docker build with no push to prove the image still builds.

- [ ] **Step 2: Write the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  packages: write
  id-token: write
  attestations: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/the-kizz/trickywords
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=raw,value=latest,enable=${{ !contains(github.ref, '-') }}
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          sbom: true
          provenance: mode=max
      - uses: actions/attest-build-provenance@v2
        with:
          subject-name: ghcr.io/the-kizz/trickywords
          subject-digest: ${{ steps.build.outputs.digest }}
          push-to-registry: true
```

Note the `enable` condition on `:latest` — a pre-release tag like `v1.1.0-rc1` must never move `:latest`, matching the channel model documented in the README.

- [ ] **Step 3: Write the edge workflow**

`.github/workflows/edge.yml` — on push to `main`, the same multi-arch build pushing only `:edge`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows
git commit -m "ci: add CI and multi-arch GHCR release workflows"
```

---

## Task 23: README, screenshots and UI review

**Files:**
- Create: `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `tests/e2e/screenshots.spec.ts`, `docs/screenshots/*.png`

**Interfaces:**
- Consumes: the seeded demo database.
- Produces: README screenshots generated from demo data only.

**Invoke the `playwright-skill`** for the screenshot capture.

- [ ] **Step 1: Write the screenshot spec**

Create `tests/e2e/screenshots.spec.ts` capturing, from the seeded demo profiles (`Robin`, `Sam`):

1. `01-profile-chooser.png` — the family home
2. `02-progress-map.png` — the island map with sets 1–2 complete
3. `03-listen-and-find.png` — mid-round, showing the audio button and word choices
4. `04-heart-word-builder.png` — `said` part-built, heart visible over `ai`
5. `05-sticker-book.png` — a partly filled sticker sheet
6. `06-parent-area.png` — per-word progress including the struggling note
7. `07-public-guest.png` — the public guest home, avatars and Start again

Every screenshot uses demo data only. Assert it before saving:

```ts
test.afterEach(async ({ page }) => {
  const html = await page.content()
  for (const banned of [process.env.USER ?? '___none___', '@']) {
    expect(html).not.toContain(banned)
  }
})
```

Capture each at 1280×800 and re-capture `03` at 390×844 as `03-mobile.png` to prove the phone layout.

- [ ] **Step 2: Review the screenshots against the UI checklist**

**Open every PNG and look at it.** Check each against the `ui-ux-pro-max` pre-delivery checklist:

- every interactive element is visibly ≥76px
- text contrast reads as ≥4.5:1 against its actual background
- no emoji used as an icon
- focus rings visible under keyboard focus
- the layout holds at 390px with no horizontal scroll
- words render in Andika with single-storey `a` and `g`
- nothing on screen reads as a failure, a score, or a tally
- the companion is clearly original art

Fix every issue found, then regenerate. **Do not skip this step** — it is the whole basis of the "review the screenshots and fix problems before release" requirement, and a checklist run without looking at the images is not a review.

- [ ] **Step 3: Write the README**

Match the `homekeep` house style, which is the established pattern across these repos:

- one-line description blockquote at the top
- centred hero screenshot (`<p align="center"><img ... width="85%"></p>`)
- badge row: release, CI, AGPL v3, Next.js, Docker multi-arch
- `## What it is` — what it does and why it exists, plainly
- `## Guiding principles` — the numbered list from the spec (no fail states, errorless first, teach the word not the picture, honest about difficulty, collect nothing we don't need)
- `## What's in the box` — the seven games, the progress engine, companion/map/stickers, parent area, public mode
- `## The research behind it` — short section citing orthographic mapping, spaced retrieval, errorless learning, NN/g touch targets; this is the differentiator, say it plainly
- `## Stack`
- `## Quickstart` — `docker run` first, then the image tags table (`:latest` stable, `:edge`, `:1`, `:1.0`, `:1.0.0` — same model as homekeep), then compose
- `## Putting it on a public address` — the public-mode compose, what it does and does not do
- `## Environment variables` — `TRICKYWORDS_MODE`, `TRICKYWORDS_DB`, `PORT`, `TZ`
- `## Word sets` — the 12 defaults, how to edit, the honesty note about decodable vs heart words
- `## Development`
- `## Known limits`
- `## Contributing`
- `## License`
- `## Security`
- `## Credits`

The **Security** section must say plainly:

> Run Tricky Words in family mode on your home network or behind a VPN. Do not expose it to the internet. The parent PIN is a child gate, not authentication — it stops a six-year-old reaching the settings, and nothing more.
>
> Public mode is the supported way to put Tricky Words on a public address. It mounts no database, makes no writes, has no parent area, and never asks a child for a name.

The **Credits** section ends in the `box-butler` style:

```
<sub>Built with the help of Claude (Anthropic).</sub>
```

- [ ] **Step 4: Add LICENSE, SECURITY.md and CONTRIBUTING.md**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```

`SECURITY.md`: threat model (family mode is LAN-only and holds child data; public mode is read-only and data-free), what the PIN is and is not, how to report a vulnerability.

`CONTRIBUTING.md`: small project, PRs welcome, open an issue before a big change, run `npm test && npm run test:e2e` before submitting.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE SECURITY.md CONTRIBUTING.md docs/screenshots tests/e2e/screenshots.spec.ts
git commit -m "docs: add README, licence, security policy and screenshots"
```

---

## Task 24: Code review, privacy scan and publish

> Set `PERSONAL_TERMS` in your shell to a pipe-separated list of the operator's
> own identifying strings (names, employer, hostnames, personal domains) before
> running the scans below. Deliberately not hard-coded here: this document is
> published, and enumerating those terms in it would be the very leak the scan
> exists to prevent.

**Files:** verification only; fixes as needed.

**Invoke `superpowers:requesting-code-review` before Step 1**, and `superpowers:verification-before-completion` before making any success claim.

- [ ] **Step 1: Scan the working tree for personal information**

```bash
grep -rIn -i -E "$PERSONAL_TERMS" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next . \
  && echo "FOUND - must be removed" || echo "tree clean"
```

- [ ] **Step 2: Scan the full git history, not just the tree**

```bash
git log -p --all \
  | grep -n -i -E "$PERSONAL_TERMS" \
  && echo "FOUND IN HISTORY - rewrite before publishing" || echo "history clean"

git log --format='%an <%ae>%n%cn <%ce>' --all | sort -u
```

The author list must contain exactly `the-kizz <33205454+the-kizz@users.noreply.github.com>` and nothing else. If anything else appears, fix it with `git filter-repo` **before** the repo is pushed — after the push it is public.

- [ ] **Step 3: Verify no real child data, PINs or databases are committed**

```bash
git ls-files | grep -E '\.db$|^data/' && echo "MUST NOT BE COMMITTED" || echo "no db files"
grep -rIn -E '"pin"\s*:|pinHash\s*=' --exclude-dir=.git --exclude-dir=node_modules src/ \
  || echo "no literal PINs"
grep -c 'data/' .gitignore
```

Confirm `.gitignore` covers `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env*`.

- [ ] **Step 4: Run the full verification suite**

```bash
npm run typecheck
npm test
npm run test:e2e
docker build -f docker/Dockerfile -t trickywords:verify .
```

All four must pass. **Record the actual output.** Do not claim success without it.

- [ ] **Step 5: Create the public repo and push**

```bash
gh repo create the-kizz/trickywords --public \
  --description "Playful sight-word practice for young readers. Self-hosted, one container, works offline." \
  --source . --remote origin --push

gh repo edit the-kizz/trickywords \
  --add-topic education --add-topic literacy --add-topic self-hosted \
  --add-topic docker --add-topic children --add-topic sight-words \
  --add-topic phonics --add-topic nextjs
```

- [ ] **Step 6: Tag the release and watch the build**

```bash
git tag -a v1.0.0 -m "Tricky Words v1.0.0"
git push origin v1.0.0
gh run watch
```

- [ ] **Step 7: Verify the published image actually runs**

```bash
docker run --rm -d -p 3000:3000 --name tw-verify ghcr.io/the-kizz/trickywords:latest
curl -fsS http://127.0.0.1:3000/api/health
docker rm -f tw-verify

docker manifest inspect ghcr.io/the-kizz/trickywords:latest \
  | grep -o '"architecture": "[a-z0-9]*"' | sort -u
```

Expect both `amd64` and `arm64`.

- [ ] **Step 8: Report**

Give the repo URL, the image name, and the one-line install command. State plainly what was verified with output in hand, and what was not.

---

## Self-Review

Run against the spec (`docs/superpowers/specs/2026-09-16-trickywords-design.md`).

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1 Two deployments, one image | 8, 19, 21 |
| 2 Principles (no fail states, errorless, honesty) | 2, 5, 13, 14, 15 |
| 3.1 Orthographic mapping | 2 (word model), 14 (Heart Word Builder) |
| 3.2 Expanding spaced retrieval | 4, 7 |
| 3.3 Errorless learning | 5, 6 |
| 3.4 NN/g touch targets, no drag | 1 (`MIN_TARGET_PX`), 11, 15 |
| 4 Word model + 12 sets + honesty rule | 2 |
| 5 Progress engine, strugglers, session shape, unlock | 4, 5, 6, 7 |
| 6 Seven games | 13, 14, 15 |
| 6.1 Companion, map, stickers | 16 |
| 7 Audio (Piper CC BY 4.0, parent recording) | 12, 18 |
| 8.1 Stack | 1 |
| 8.2 Structural mode separation | 8, 19, 21 |
| 8.3 Guest session model | 10, 19, 20 |
| 8.4 Shareable set links | 19, 20 |
| 9 Design system + hard UI rules | 11 |
| 10 Privacy and security | 18, 19, 21, 23, 24 |
| 11 Testing | every task; 20, 23 |
| 12 Release | 21, 22, 24 |

No spec section is unimplemented.

**Placeholder scan:** no "TBD", no "implement later", no "add error handling" without saying what. Tasks 15, 16, 18, 19 and 23 describe components in prose rather than full code — each states its exact interface, its required behaviours, and the constraints it must satisfy, and each is covered by the test code given in full. That is a deliberate boundary, not a gap: the shared behavioural test in Task 15 is what actually gates those five games.

**Type consistency checked:**

- `WordProgress` fields identical across Tasks 4, 9, 10.
- `SupportLevel` shape identical across Tasks 5, 6, 7.
- `Round` and `GameProps` identical across Tasks 7, 13, 14, 15.
- `getDb` returns `Db`, used consistently in Tasks 9, 17, 18.
- `MIN_TARGET_PX` defined once in Task 1, imported in 11 and asserted in 15.
- `PhraseKey` values used in games all exist in the `PHRASES` map in Task 12 (`tryAgain`, `wellDone`, `keepLooking`).
- `GuestState` identical across Tasks 10 and 19.

**Known ordering constraint:** Task 12 Step 5 imports `PHRASES` from `src/lib/audio/manifest.ts`, so the manifest (Step 3) must be written before the generation script is run (Step 6). The step order already enforces this.
