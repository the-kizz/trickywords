/**
 * Writes the job list that renders the app's clips in Australian English.
 *
 * MeloTTS is the only open engine with an Australian English speaker, and it
 * pins an old `transformers`, so it runs in its own Python 3.11 container
 * rather than on the machine building the app. See `docs/voice-decisions.md`
 * for the recipe, the per-word decisions, and why each one was made.
 *
 * Sentences and instructions need none of this: a word inside a sentence
 * carries the stress, pitch and reduction that make it sound right, and the
 * engine handles them correctly first time. Everything below exists to put
 * that context back around a word standing on its own.
 */
import { DEFAULT_SETS } from '../src/lib/words/default-sets'
import { PHRASES } from '../src/lib/audio/manifest'

/** Where in the carrier the wanted word sits. */
type Take = 'first' | 'last'

interface Voice {
  /** Respelling, when the real spelling makes the engine say it wrong. */
  say?: string
  /** Which occurrence to cut out. Default 'first'. */
  take?: Take
  /** Synthesis rate. Slower is longer. Default 0.55. */
  speed?: number
}

/**
 * Per-word settings, every one chosen by ear by the parent who uses this with
 * their child. Defaults suit most words; entries here are the exceptions.
 *
 * A word is rendered inside "<say>, <say>." and then cut back out. English
 * lengthens a word before a pause, so the carrier makes the model speak it
 * long of its own accord -- a single word rendered alone comes out too quick
 * to take in, and stretching the audio afterwards sounds wrong.
 */
const VOICE: Readonly<Record<string, Voice>> = {
  // The dictionary form is a sound the child will never meet on a page.
  a: { say: 'uh' },
  // Respelling "the" would lose the voiced "th" -- see the decisions doc.
  the: {},
  // The engine mangles the real spellings of these two.
  could: { say: 'kood' },
  has: {},
  // Deliberate: gives an /f/ ending where the word has /v/. See the doc.
  of: { say: 'off', speed: 0.70 },
  // Falling, finished intonation rather than the rising one before a comma.
  you: { take: 'last' },
  // Lengths chosen individually; these needed to differ from the default.
  them: { speed: 0.85 },
  do: { speed: 0.75 },
}

const DEFAULT_SPEED = 0.55

/**
 * Rate for running speech. 0.60 unless a particular clip has been listened to
 * and judged better faster.
 *
 * At 0.60 the model does not simply speak slowly, it stretches the wrong
 * parts, and "His cat is fat." ran 1465ms with the stress in odd places. Three
 * sentences were compared at 0.85 and preferred -- but three approvals are not
 * fifty-six, and the rest have not been heard at that rate. They stay as they
 * are until they are.
 */
const NATURAL_SPEED = 0.60

/** Clips heard at 0.85 and preferred. Grows only by listening. */
const FASTER = new Set(['his', 'the', 'them'])
const punctuated = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)

const words = DEFAULT_SETS.flatMap((s) => s.words)

/** One entry per clip: what to say, and how to cut the word back out. */
const jobs = [
  ...words.map((w) => {
    const v = VOICE[w.text.toLowerCase()] ?? {}
    const said = v.say ?? w.text
    return {
      text: `${said}, ${said}.`,
      out: `/out/words/${w.audioId}.wav`,
      take: v.take ?? 'first',
      speed: v.speed ?? DEFAULT_SPEED,
      extract: true,
    }
  }),
  // Instructions and sentences are natural speech and need no carrier.
  ...Object.entries(PHRASES).map(([key, text]) => ({
    text: punctuated(text), out: `/out/phrases/${key}.wav`,
    take: 'first' as Take, speed: NATURAL_SPEED, extract: false,
  })),
  ...words.map((w) => ({
    text: w.sentences[0], out: `/out/sentences/${w.audioId}.wav`,
    take: 'first' as Take,
    speed: FASTER.has(w.audioId) ? 0.85 : NATURAL_SPEED,
    extract: false,
  })),
]

process.stdout.write(`${JSON.stringify(jobs, null, 1)}\n`)
