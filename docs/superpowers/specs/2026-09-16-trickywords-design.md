# Tricky Words — Design Spec

**Date:** 2026-09-16
**Status:** Approved, pre-implementation
**Repo:** `github.com/the-kizz/trickywords`
**Image:** `ghcr.io/the-kizz/trickywords`
**Licence:** AGPL-3.0-or-later

---

## 1. What this is

A self-hosted web app that helps children of roughly 5–7 learn high-frequency
"tricky words" through short, playful games. It runs as one container on a home
server, holds no cloud dependencies, phones nothing home, and can be deployed a
second time — from the same image — as a public, data-free guest site for a
class or for friends.

Two deployments, one image:

| | **Family** | **Public** |
|---|---|---|
| Audience | one household, known children | anyone with the link |
| Network | LAN or VPN only | internet-facing subdomain |
| Identity | named profiles created by a parent | pick an avatar, no name ever asked |
| Progress | SQLite, permanent, per child | `sessionStorage`, per tab, gone on close |
| Parent area | PIN-gated, full control | route does not exist |
| Writes to disk | yes | none |

---

## 2. Principles

1. **No fail states.** Nothing in the child-facing app says "wrong". A mistake
   produces a gentle re-prompt and another attempt, never a loss, a red cross,
   or a score going down.
2. **Errorless first, fading support.** A word's earliest encounters are
   engineered so the child almost cannot get it wrong. Support fades as the word
   strengthens.
3. **Teach the word, not the picture of the word.** The app is built on
   orthographic mapping, not visual memorisation.
4. **Honest about difficulty.** Words that are actually decodable are not
   presented as things to memorise.
5. **Collect nothing we do not need.** The public side collects nothing at all.
   The family side holds only what a parent typed in themselves.
6. **A child must never need to read an instruction.** Every instruction is
   available as audio, and every screen is navigable by a pre-reader.

---

## 3. Research basis

The design decisions below are driven by four findings, recorded here so future
changes can be checked against them rather than against taste.

### 3.1 Orthographic mapping, not flashcards

Words are not stored in memory as visual shapes. They are stored by bonding
phonemes to graphemes — orthographic mapping (Ehri, 2014; Kilpatrick, 2015).
Around 40% of high-frequency words are "heart words": mostly regular, with one
irregular part that must be learned by heart.

**Consequence:** every word record carries a phoneme/grapheme segmentation and a
flag on the irregular grapheme(s). One game (Heart Word Builder) teaches this
mapping directly. Word display can render the tricky part marked with a heart.

### 3.2 Spaced retrieval, expanding schedule

Repeated *retrieval* outperforms repeated *exposure*, even when exposure count is
held equal or higher. Expanding intervals (short, then progressively longer) keep
early retrieval likely to succeed while still stretching memory.

**Consequence:** the scheduler is an expanding-interval ladder driven by recall
attempts, not by time spent looking at words.

### 3.3 Errorless learning

Prompting that makes a correct response near-certain, then fading that prompt
systematically, reduces frustration and raises motivation during acquisition.

**Consequence:** distractor count and distractor similarity are both functions of
a word's strength. A brand-new word appears with one easy distractor and heavy
audio/visual prompting.

### 3.4 Child physical and cognitive development (NN/g)

Children in this band need touch targets around **2cm × 2cm** — roughly 4× the
adult minimum — and **struggle badly with dragging**, especially over distance or
to a precise location. Audio instruction is required for pre-readers. Feedback is
expected for essentially every action.

**Consequence:** a hard 76px minimum on every interactive element, **no drag
interaction anywhere in the app**, audio on every instruction, and a visible
response to every tap within 100ms.

---

## 4. Word model

### 4.1 Default sets

12 sets, 56 words, all editable in the app.

| Set | Words |
|---|---|
| 1 | I, the, my, a, is |
| 2 | was, you, to, they, that |
| 3 | said, are, he, she, me, be, we |
| 4 | were, has, look, one |
| 5 | his, her, them, there |
| 6 | have, of, here, with |
| 7 | all, call, ball, tall, little |
| 8 | go, so, no, this, then |
| 9 | put, as, do, like, very |
| 10 | what, where, want, some, come |
| 11 | down, out, for, or |
| 12 | should, would, could |

### 4.2 Word record

Each word carries more than its spelling:

- `text` — the word as displayed
- `graphemes` — ordered segmentation, e.g. `said` → `s` / `ai` / `d`
- `phonemes` — parallel array, e.g. `/s/` `/e/` `/d/`
- `trickyIndices` — which grapheme(s) are irregular; `said` → index 1
- `classification` — one of:
  - `heart` — mostly regular with an irregular part (`said`, `was`, `one`)
  - `decodable` — fully regular, included because it is frequent (`this`,
    `then`, `go`, `so`, `no`)
  - `family` — regular member of a spelling pattern (`all`, `call`, `ball`,
    `tall`)
- `sentences` — 1–3 short decodable sentences containing the word, for Word
  Spotter and for context prompts
- `audioId` — key for the bundled clip and any parent recording

**Honesty rule:** `decodable` and `family` words are never presented to the child
as "learn this by heart". A `family` word shows its shared pattern; a `decodable`
word is sounded out. This is the point flagged during design: `this`, `then`,
`so`, `go`, `no` and the `all`/`call`/`ball`/`tall` group are not genuinely
tricky, and the app will not pretend otherwise.

---

## 5. Progress engine

The engine is pure, deterministic, and has no I/O. It is the most heavily tested
part of the system and is developed test-first.

### 5.1 Per-word state

Each (child, word) pair holds:

- `stage` — `new` → `learning` → `reviewing` → `known`
- `box` — expanding-interval rung, 0–5
- `dueInSessions` — countdown, decremented once per completed session
- `correctStreak`, `attempts`, `lapses`
- `struggling` — boolean

### 5.2 Expanding ladder

Intervals are measured in **sessions, not days**. A child who plays twice a week
still advances; a child who plays daily is not buried. Ladder:

| Box | Next review in |
|---|---|
| 0 | same session |
| 1 | next session |
| 2 | 2 sessions |
| 3 | 4 sessions |
| 4 | 8 sessions |
| 5 | 16 sessions (`known`) |

A correct, unprompted retrieval promotes one box. A miss demotes to box 0 and
increments `lapses`.

### 5.3 Struggler detection

Three lapses on a word sets `struggling`. A struggling word:

- returns to fully errorless presentation (one easy distractor, full prompting)
- is capped at one appearance per session, so it never dominates
- surfaces in the parent area with a plain-language note

`struggling` clears after two consecutive unprompted correct retrievals.

### 5.4 Support level (errorless fading)

Support is a function of box, not a separate setting:

| Box | Choices shown | Distractor similarity | Prompting |
|---|---|---|---|
| 0 | 2 | maximally different | word shown + spoken before the round |
| 1 | 3 | different first letter | spoken before the round |
| 2 | 3 | different first letter | spoken on request |
| 3 | 4 | shares a letter | spoken on request |
| 4–5 | 4 | orthographically near (`them`/`then`, `where`/`were`) | spoken on request |

Distractor similarity uses edit distance plus shared-prefix weighting, drawn from
words the child has already met where possible.

### 5.5 Session shape

A session is ~5 minutes, roughly 40% new / 60% review, and **always ends on a
word the child gets right** — the engine reserves a high-confidence word for the
final round. A set unlocks the next when **80% or more** of its words reach `known` (rounded down, so a 5-word set needs 4).

---

## 6. Games

All seven are tap-only. None uses drag. All obey the 76px target minimum.

| Game | Purpose | Mechanic |
|---|---|---|
| **Listen & Find** | receptive recognition; the errorless core loop | hear the word, tap it among distractors |
| **Heart Word Builder** | orthographic mapping | tap grapheme tiles in order to build the word; tricky part marked with a heart |
| **Word Swat** | automaticity and fluency | words drift; swat the called word; no timer that can be lost |
| **Memory Pairs** | recognition under load | tap-tap pairing, never drag |
| **Bingo** | sustained listening | audio-called words on a 3×3 card |
| **Word Spotter** | transfer to connected text | tap the target word inside a short decodable sentence |
| **Treasure Hunt** | ties the map together | each word found opens the next step of a path |

### 6.1 Companion, map, stickers

- **Companion** — an original character that grows and gains detail as words are
  learned. Original SVG art, drawn for this project. No resemblance to any
  commercial product.
- **Progress map** — a path of islands, one per set, showing where the child is.
- **Sticker book** — earned stickers, all original art.

On the **family** side these persist permanently. On the **public** side they
compress into a single-session arc: the companion grows and the sticker sheet
fills over one ~10 minute sitting, ending on a satisfying summary screen.

---

## 7. Audio

### 7.1 Bundled clips

Word and instruction audio is generated **at build time, offline** by Piper
(OHF-Voice/piper1-gpl) using voice `en_GB/alba/medium`, which is licensed
**CC BY 4.0** and trained on the University of Edinburgh datashare corpus.
Attribution goes in `NOTICE` and the README credits.

`en_GB/jenny_dioco` was evaluated and **rejected**: its model card states only
"License: See URL" with no readable terms. No audio ships from a voice whose
licence cannot be verified.

`scripts/generate-audio.ts` is committed so anyone can regenerate with a
different voice by changing one constant. Output is small `.ogg` files committed
to the repo, so building the image needs no TTS toolchain.

### 7.2 Parent recordings

The parent area allows recording the parent's own voice for any word, via
`MediaRecorder`, stored in the data volume. A familiar voice is better for a
child than any synthetic voice. Parent recordings override bundled clips.

**Public mode has no recording capability** — it makes no writes of any kind.

### 7.3 Why not Web Speech API

`speechSynthesis` voice availability varies by browser and OS, and a headless
Linux/Chromium host may have no voice installed at all. Audio is the core
mechanic of this app, not an enhancement, so it cannot depend on the client
having a usable voice.

---

## 8. Architecture

### 8.1 Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind 4
- Motion — spring-physics animation
- SQLite via Drizzle + `better-sqlite3`, WAL mode
- Vitest (unit) + Playwright (E2E and screenshots)
- Single container, `output: 'standalone'`

PocketBase is deliberately **not** used. It exists in the sibling `homekeep`
project to serve real multi-user auth and invite flows; this app has local
profiles and a PIN gate, which do not justify a second process.

### 8.2 Mode separation

`TRICKYWORDS_MODE` is `family` (default) or `public`.

The separation is enforced **structurally, not by permission checks**. In public
mode:

- no data volume is mounted, so there is no family database in the container's
  filesystem to leak
- the parent area and all write routes are not registered at all
- the only persistence is `sessionStorage` in the visitor's browser

This matters because the family database holds children's names, per-word
progress, and recordings of children's voices. A scattered `if (mode ===
'public')` check is one missed branch away from publishing a child's name.
Absence of the data is a stronger guarantee than a guard over it.

Word sets reach the public container through a **read-only bind mount of a single
JSON file** that the family container writes. Content flows out; nothing flows
in.

### 8.3 Guest session model

Guest progress lives in `sessionStorage`:

- **per tab** — two children on two tabs are two independent players, so
  concurrent guests cannot collide; the server holds no per-visitor state at all
- **survives refresh** — an accidental pull-to-refresh on a tablet does not
  destroy a child's game
- **gone on tab close** — session-only, nothing retained, nothing to clean up
- **never sent to the server** — unlike a cookie, so no consent banner and no
  server-side data about visitors

A prominent **Start again** button resets it for the next child on a shared
device.

Cookies were considered and rejected: ~4KB limit, transmitted on every request,
and any cookie on a public children's site invites consent obligations for no
benefit.

Deliberately **out of scope**: shared leaderboards, rooms, or any feature where
children see each other's names or scores. That would turn a zero-data public
site into one holding identifiable data about children, and would need
moderation.

### 8.4 Shareable set links

`/play?set=3` drops a class straight into a chosen set. Stateless, no server
state, one link a teacher can paste anywhere.

---

## 9. Design system

Derived from `ui-ux-pro-max`, with two deliberate departures recorded here.

- **Style:** Claymorphism — soft 3D, chunky, thick borders, 16–24px radii, double
  shadows, soft 200ms press.
- **Palette:** learning blue `#2563EB`, play yellow `#F59E0B`, fun pink `#EC4899`
  on `#EFF6FF`, foreground `#0F172A`.
- **Type:** **Andika** (SIL, OFL) for every displayed *word*; Baloo 2 for UI
  headings. *Departure:* the tool suggested Comic Neue for body. Andika is
  purpose-built for early literacy with unambiguous single-storey `a` and `g` —
  when the letterform is the lesson, it has to be right.
- *Departure:* the tool's "Trust & Authority" landing pattern was discarded as
  off-domain for an app.
- **Fonts are self-hosted.** No CDN — the app must work with no internet.
- **Motion:** spring physics, staggered reveals, `prefers-reduced-motion`
  respected throughout.

### 9.1 Hard UI rules

- Every interactive element ≥ **76px** (NN/g 2cm).
- **No drag anywhere.**
- Visible response to every tap within 100ms.
- Contrast ≥ 4.5:1 for text; focus rings never removed.
- Every instruction has an audio equivalent.
- No emoji as icons — SVG only.

---

## 10. Privacy and security

- **Family mode is for LAN or VPN only.** Documented plainly in the README and
  `SECURITY.md`. The parent PIN is a **child-gate, not authentication** — it
  stops a 6-year-old reaching the settings, and is not designed to resist an
  adult attacker. This is stated explicitly so nobody mistakes it for security.
- **Public mode** makes no writes, mounts no family data, has no parent area, and
  asks for no name. Attack surface is a read-only Node process.
- No analytics, no telemetry, no external requests at runtime.
- No real child names, PINs, or personal data anywhere in the repo. All demo data
  and screenshots use invented names.

---

## 11. Testing

- **Vitest, test-first**, on the progress engine: ladder promotion/demotion,
  struggler detection and clearing, support-level derivation, distractor
  selection, session composition, end-on-success guarantee, set unlocking. These
  are pure functions and are the part most worth testing hard.
- **Playwright E2E**: each of the seven games playable end to end, profile
  creation, PIN gate, guest session behaviour (including refresh-survives and
  tab-close-clears), and public-mode route absence.
- **Playwright screenshots** for the README, generated from a seeded demo
  profile with invented names, then reviewed against the `ui-ux-pro-max`
  pre-delivery checklist and fixed before release.
- **Accessibility checks** in CI: contrast, target size, focus visibility,
  reduced-motion.

---

## 12. Release

- **CI** on PR: lint, typecheck, unit, E2E.
- **Release**: buildx multi-arch `linux/amd64` + `linux/arm64` to
  `ghcr.io/the-kizz/trickywords`, with SBOM and provenance attestation.
- **Tags**: `:latest` (stable), `:edge` (every push to main), `:1`, `:1.0`,
  `:1.0.0` — the channel model used by the sibling `homekeep` project.
- **Docs**: README in the `homekeep` house style; credits line in the
  `box-butler` style noting the build was done with the help of Claude.
- **Identity**: all commits authored `the-kizz
  <33205454+the-kizz@users.noreply.github.com>`, set at repo level.

---

## 13. Out of scope for v1

- Accounts, cloud sync, or any multi-device progress
- Shared leaderboards or any child-to-child visibility
- Phonics instruction beyond the tricky-word set
- Offline writes / PWA install (may follow; not v1)
- Languages other than English
