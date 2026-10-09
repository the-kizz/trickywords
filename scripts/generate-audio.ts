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
 * One-time setup (outside this repo — do not commit the venv or the
 * voice model):
 *
 *   python3 -m venv /tmp/piper-venv
 *   /tmp/piper-venv/bin/pip install -q piper-tts
 *
 *   mkdir -p /tmp/piper-voices && cd /tmp/piper-voices
 *   /tmp/piper-venv/bin/python -m piper.download_voices en_GB-alba-medium
 *   # produces en_GB-alba-medium.onnx and en_GB-alba-medium.onnx.json
 *
 * Usage:
 *   npx tsx scripts/generate-audio.ts
 *
 * The paths below can be overridden via env vars if your venv/voice
 * live elsewhere; defaults match the setup steps above.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { DEFAULT_SETS } from '../src/lib/words/default-sets'
import { PHRASES } from '../src/lib/audio/manifest'

/**
 * Where the raw speech comes from.
 *
 * `piper` synthesises here, with this script driving it. `prerendered`
 * takes WAVs another engine has already written -- MeloTTS, which is the
 * only open engine with an Australian English speaker and which pins an
 * old transformers, so it runs in its own Python 3.11 container rather
 * than on this machine. Either way the trimming, the Opus encode, the
 * run-on guard and `durations.ts` stay here, so one pipeline owns clip
 * length and the timing table the player depends on.
 *
 * With `prerendered`, VOICE_WAV_DIR holds `words/`, `phrases/` and
 * `sentences/` named exactly as the ogg files are.
 */
const VOICE_SOURCE = process.env.TRICKYWORDS_VOICE_SOURCE ?? 'piper'
const VOICE_WAV_DIR = process.env.TRICKYWORDS_VOICE_WAV_DIR ?? '/tmp/melo-out'

const PIPER_PYTHON = process.env.PIPER_PYTHON ?? '/tmp/piper-venv/bin/python'
const VOICE_MODEL =
  process.env.PIPER_VOICE_MODEL ?? '/tmp/piper-voices/en_GB-alba-medium.onnx'
const OUT = 'public/audio'
const DURATIONS_MODULE = 'src/lib/audio/durations.ts'

/**
 * Piper's default rate is pitched for an adult listener and runs ahead of
 * a five-year-old's comprehension, most visibly on the longer words in
 * sets 10-12 and on the game instructions, which a child hears once and
 * has to act on. 1.2 is 20% slower.
 *
 * Changing this changes every clip's length, so `durations.ts` must be
 * regenerated with it -- which is why this script writes that file rather
 * than leaving the timings to be guessed at in the player.
 */
const LENGTH_SCALE = process.env.PIPER_LENGTH_SCALE ?? '1.2'

/**
 * Piper needs terminal punctuation to know it has reached the end of an
 * utterance. Given a bare word it can run on, inventing speech: the
 * high-quality `cori` voice produced 6.0s of continuous sound for "the",
 * and non-deterministically -- a second run gave 3.3s. A full stop fixes
 * it outright (0.8s), so every utterance gets one.
 *
 * Text that already ends in punctuation is left alone: "Well done!" must
 * not become "Well done!.".
 */
function speechText(text: string): string {
  const said = SPOKEN_AS[text.toLowerCase()]
  if (said) return said
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/**
 * Words Piper says in their dictionary form when a child needs the sound
 * the word actually makes while reading.
 *
 * `a` is the one that matters most and the one that proved it: asking for
 * `[[ˈeɪ]]` produces a clip identical in length to plain "a", so the voice
 * really is saying the letter name, "ay". A child taught "ay" has learned
 * something they will never meet on a page -- in every sentence they read,
 * `a` is "uh".
 *
 * This is not an accent problem and no other voice would fix it; it is
 * what any engine does with a function word handed to it on its own.
 * Values are IPA inside double brackets, which Piper passes to espeak-ng
 * as phonemes instead of text.
 *
 * Deliberately short. Every entry overrides how a child is taught a word,
 * so a word belongs here only where the isolated form is genuinely
 * misleading, and each one is a decision for whoever is teaching the
 * child -- not something to extend by guesswork.
 */
const SPOKEN_AS: Readonly<Record<string, string>> = {
  a: '[[ə]]',
}

/**
 * Longest a single spoken word may run before we treat it as the model
 * having run on rather than having said the word. The slowest legitimate
 * word in the twelve sets sits well under this at LENGTH_SCALE 1.2.
 */
const MAX_WORD_MS = 2000

/**
 * Cuts each clip so the word starts at once.
 *
 * Piper leaves 60-170ms of low-level breath before the word begins, and a
 * word that starts late is heard as a word that fades in -- on the
 * shortest words, where the vowel is most of the word, it is heard as no
 * word at all. `silenceremove` will not touch it at any threshold safe
 * for a consonant onset, because it is sound rather than silence, so the
 * cut is made explicitly: find where the clip first comes within
 * ONSET_HEADROOM_DB of its own peak and start a few milliseconds before
 * that.
 *
 * The same is done to the tail, where Piper leaves up to 200ms. The tail
 * matters for pacing rather than clarity: the player waits out a clip's
 * measured length before speaking the next, so trailing silence is dead
 * time between every word a child hears.
 *
 * Measured on the WAV and applied during the one encode to Opus. Trimming
 * the encoded file instead meant decoding and re-encoding it at 32kbps, and
 * that second pass was audible: single words survived it, but the longer
 * phrases came back muddy -- "Well done!" noticeably so. There is one lossy
 * step, and it happens once.
 *
 * One headroom figure cannot do both jobs. A vowel carries nearly all of a
 * clip's energy, so a gate set close enough to the peak to ignore breath
 * also sits *above* every unvoiced sound in the language: a final /s/ runs
 * 25-30dB down on the vowel before it, and a word-initial /h/ is quieter
 * still. Cut on that gate and "cats" ends as "cat", "his" begins as "is" --
 * both heard, in those words, before this was understood.
 *
 * So the bounds are found in two passes. LOUD_DB finds the body of the
 * speech, which is what the gate is good at; QUIET_DB then walks outward
 * from each end for as long as the clip stays above a much lower floor,
 * which is what a fricative lives in. The walk is capped -- EDGE_MS in
 * either direction -- because below the quiet floor there is no longer a
 * difference between a fricative and the room, and an uncapped walk just
 * hands the trailing breath back.
 */
const LOUD_DB = 22
const QUIET_DB = 38
const EDGE_MS = 140
const ONSET_PAD_MS = 8
const TAIL_PAD_MS = 70

function speechBounds(wav: string): { startMs: number; endMs: number } | null {
  const probe = execFileSync('ffmpeg', [
    '-v', 'quiet', '-i', wav, '-f', 's16le', '-ac', '1', '-ar', '16000', '-',
  ], { maxBuffer: 64 * 1024 * 1024 })
  const samples = new Int16Array(
    probe.buffer.slice(probe.byteOffset, probe.byteOffset + probe.byteLength),
  )
  const win = 160 // 10ms at 16kHz
  const levels: number[] = []
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0
    for (let k = i; k < i + win; k++) sum += samples[k] * samples[k]
    levels.push(Math.sqrt(sum / win))
  }
  if (levels.length === 0) return null
  const peak = Math.max(...levels)
  const loud = peak * Math.pow(10, -LOUD_DB / 20)
  const quiet = peak * Math.pow(10, -QUIET_DB / 20)

  // Pass one: the body of the speech, which the loud gate finds reliably.
  let first = levels.findIndex((l) => l >= loud)
  let last = -1
  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i] >= loud) { last = i; break }
  }
  if (first < 0 || last < first) return null

  // Pass two: walk outward while the clip stays above the quiet floor, so a
  // breathy onset and a fricative tail come back. Capped, or the walk gives
  // the trailing breath back with them.
  const edge = EDGE_MS / 10
  const startLimit = Math.max(0, first - edge)
  while (first > startLimit && levels[first - 1] >= quiet) first--
  const endLimit = Math.min(levels.length - 1, last + edge)
  while (last < endLimit && levels[last + 1] >= quiet) last++

  return {
    startMs: Math.max(0, first * 10 - ONSET_PAD_MS),
    endMs: Math.min(levels.length * 10, (last + 1) * 10 + TAIL_PAD_MS),
  }
}

function say(text: string, file: string) {
  if (existsSync(file)) return
  const wav = `${file}.wav`
  if (VOICE_SOURCE === 'prerendered') {
    // `file` is public/audio/<kind>/<name>.ogg; the WAV sits at the same
    // relative path under VOICE_WAV_DIR.
    const relative = file.replace(`${OUT}/`, '').replace(/\.ogg$/, '.wav')
    const source = `${VOICE_WAV_DIR}/${relative}`
    if (!existsSync(source)) {
      throw new Error(`no pre-rendered clip for ${file} at ${source}`)
    }
    copyFileSync(source, wav)
  } else {
    execFileSync(
      PIPER_PYTHON,
      ['-m', 'piper', '-m', VOICE_MODEL, '--length-scale', LENGTH_SCALE, '-f', wav],
      { input: speechText(text) },
    )
  }
  // A pre-rendered clip has already been cut, by the extractor that owns
  // the harder problem: picking one take out of several and keeping the
  // pronunciation a child needs. Cutting it a second time here only ever
  // takes more off, and what it takes is a stop release -- the burst of a
  // final /k/ arrives *after* its own silent closure, so the outward walk
  // below, which needs unbroken sound, stops at the closure and ends the
  // clip before the consonant. "look" and "like" both lost their /k/ that
  // way. These clips were chosen by ear; the cut is not ours to revisit.
  const bounds = VOICE_SOURCE === 'prerendered' ? null : speechBounds(wav)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...(bounds ? ['-ss', (bounds.startMs / 1000).toFixed(3)] : []),
    ...(bounds ? ['-to', (bounds.endMs / 1000).toFixed(3)] : []),
    '-i',
    wav,
    '-c:a',
    'libopus',
    '-b:a',
    '32k',
    file,
  ])
  rmSync(wav)
}

mkdirSync(`${OUT}/words`, { recursive: true })
mkdirSync(`${OUT}/phrases`, { recursive: true })
mkdirSync(`${OUT}/sentences`, { recursive: true })

for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
  say(w.text, `${OUT}/words/${w.audioId}.ogg`)
}
for (const [key, text] of Object.entries(PHRASES)) {
  say(text, `${OUT}/phrases/${key}.ogg`)
}
// One reading of each word's example sentence. A word met in a sentence and
// heard in a sentence is a word on its way to being read in a book; the
// sentence was on screen for a child who could not yet read it, which made
// it decoration.
for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
  say(w.sentences[0], `${OUT}/sentences/${w.audioId}.ogg`)
}
/**
 * Measures every clip and writes the timings the player needs to chain two
 * clips without the second cutting the first off. Measured, not guessed:
 * the delay used to be a single 600ms constant, which was shorter than
 * "Find the word" and so truncated it every round.
 */
function durationMs(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v',
    'quiet',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return Math.round(parseFloat(out.toString()) * 1000)
}

const timings: Record<string, number> = {}
for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
  timings[`/audio/words/${w.audioId}.ogg`] = durationMs(`${OUT}/words/${w.audioId}.ogg`)
}
for (const key of Object.keys(PHRASES)) {
  timings[`/audio/phrases/${key}.ogg`] = durationMs(`${OUT}/phrases/${key}.ogg`)
}
for (const w of DEFAULT_SETS.flatMap((s) => s.words)) {
  timings[`/audio/sentences/${w.audioId}.ogg`] = durationMs(`${OUT}/sentences/${w.audioId}.ogg`)
}

const entries = Object.entries(timings)
  .map(([url, ms]) => `  '${url}': ${ms},`)
  .join('\n')

writeFileSync(
  DURATIONS_MODULE,
  `/**
 * How long each bundled clip runs, in milliseconds. GENERATED by
 * \`scripts/generate-audio.ts\` -- do not edit by hand; regenerate it
 * whenever the voice or \`LENGTH_SCALE\` changes.
 *
 * The player uses these to chain clips (see \`speakSequence\`). A
 * parent-recorded word is not in here, so anything absent falls back to
 * \`UNKNOWN_CLIP_MS\`.
 */
export const CLIP_MS: Readonly<Record<string, number>> = {
${entries}
}
`,
)

// A run-on clip is not a cosmetic defect: the player waits for a clip's
// measured length before speaking the next one, so one 6-second "the"
// stalls the round it belongs to. Fail the build rather than ship it.
const runOn = Object.entries(timings).filter(
  ([url, ms]) => url.includes('/words/') && ms > MAX_WORD_MS,
)
if (runOn.length > 0) {
  console.error(
    `\nThese single words ran past ${MAX_WORD_MS}ms, which means the voice ran on ` +
      `rather than saying the word:\n` +
      runOn.map(([url, ms]) => `  ${url}  ${ms}ms`).join('\n') +
      `\n\nDelete them and re-run; if it persists the voice is unsuitable for ` +
      `single words.\n`,
  )
  process.exit(1)
}

console.log(`Audio generated at length-scale ${LENGTH_SCALE}; ${entries.split('\n').length} timings written.`)
