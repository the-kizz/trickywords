'use client'
import { CLIP_MS } from './durations'

/**
 * One voice, app-wide.
 *
 * The active clip is tracked at module level, not per hook instance.
 * Several components hold this hook -- the session runner, the round
 * hook, the sentence moment, the say-it round, the home greeting, the
 * guest home and the finish-line screen -- and while each kept its own
 * reference they could not cancel each other, so a child arriving at a
 * round while another screen was still talking heard both at once.
 * There is one child and one pair of ears, so there is one channel.
 *
 * Three ways to use it, and the difference between them is *who asked*:
 *
 *  - `speak(url)` -- interrupt now. For anything the child initiated: a
 *    speaker tap, a tile tap, a card turned over. A child who asks to
 *    hear the word must hear it immediately, not behind a queue.
 *  - `speakSequence(urls)` -- interrupt now, then play in order.
 *  - `enqueue(urls)` -- play *after* whatever is already playing or
 *    queued. For anything the app initiated: a round's opening
 *    instruction, a celebration that must follow the word it celebrates.
 *
 * `enqueue` is why this file has a queue at all. A round is `key`ed on
 * its index, so answering one round unmounts the game and mounts the
 * next within a single commit -- and the new round's opening instruction
 * used to start 18ms after "Well done!", cancelling it mid-word. The
 * child heard "Well d--- find the word". Queued, the celebration
 * finishes and the instruction follows it.
 *
 * Playback failure is silent: a missing clip or a browser autoplay block
 * must never stop a child from playing the game.
 */
let current: HTMLAudioElement | null = null

/**
 * Bumped by every `silence`. The timer that advances the queue captures
 * it and abandons itself the moment it no longer matches, so a clip
 * belonging to an abandoned queue cannot speak over whatever interrupted
 * it.
 */
let generation = 0

interface QueuedClip {
  url: string
  /**
   * Which call put it there. A caller withdraws exactly its own clips on
   * unmount and leaves everyone else's alone -- the round that has just
   * been answered must drop its pending word without silencing the
   * celebration it triggered on the way out.
   */
  token: number
}

let queue: QueuedClip[] = []
let nextToken = 1

/**
 * Fires when the clip now playing has run its measured length, and
 * starts whatever is next. `null` whenever the channel is silent.
 */
let drain: number | null = null

/** True from the moment a clip starts until the channel falls silent. */
let speaking = false

/** Silence between two chained clips: a beat, not a pause. */
export const GAP_MS = 250

/**
 * How much longer than its own length a clip is allowed to take before
 * the queue stops waiting for it. Covers the delay between `play()` and
 * the first sound, which is network- and device-dependent. Only ever
 * reached when a clip never reports that it ended.
 */
export const STARTUP_GRACE_MS = 1200

/**
 * Assumed length of a clip we have no measurement for -- in practice a
 * parent's own recording, which is made at runtime and so cannot be in
 * the generated table. Deliberately generous: overrunning wastes a moment
 * of silence, underrunning cuts a parent's voice off mid-word.
 */
export const UNKNOWN_CLIP_MS = 1500

/**
 * How long a clip runs, from the generated `CLIP_MS` table. Exported
 * because several screens have to stay up for as long as something takes
 * to say -- the round's opening reveal, the sentence read after a
 * correct answer -- and the numbers change every time the voice is
 * regenerated, so nothing may hard-code one.
 */
export const clipDurationMs = (url: string): number => CLIP_MS[url] ?? UNKNOWN_CLIP_MS

function clearDrain() {
  if (drain !== null) {
    window.clearTimeout(drain)
    drain = null
  }
}

/**
 * Every clip that has been played or warmed, kept so it is never fetched
 * twice.
 *
 * A fresh `new Audio(url)` per play costs a fetch and a decode before any
 * sound comes out -- measured at 85ms on a local server and much worse
 * over wifi. That start-up delay is a large fraction of a short word
 * (`is` is 471ms), which is why single words were the ones a child could
 * not hear. Reusing one element per clip makes every play after the first
 * start immediately.
 *
 * Only one clip is ever playing, so reuse is safe: rewinding an element
 * that is not playing cannot interrupt anything.
 */
const clips = new Map<string, HTMLAudioElement>()

function clipFor(url: string): HTMLAudioElement | null {
  const cached = clips.get(url)
  if (cached) return cached
  try {
    const audio = new Audio(url)
    audio.preload = 'auto'
    clips.set(url, audio)
    return audio
  } catch {
    // Audio unavailable entirely (SSR, locked-down browser).
    return null
  }
}

/**
 * Fetches and decodes clips ahead of time so the first play of each is as
 * prompt as the rest. Safe to call repeatedly; already-warmed clips cost
 * nothing.
 */
export function warm(urls: readonly string[]): void {
  for (const url of urls) {
    const audio = clipFor(url)
    // `load()` aborts whatever that element is doing, so warming a clip
    // that is playing kills it mid-word -- the browser reports an
    // AbortError and the child simply hears nothing. Warm only clips
    // that have never been fetched, and never the one now speaking.
    if (audio && audio !== current && audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
      audio.load()
    }
  }
}

/**
 * Starts a clip and calls `onEnd` when it has actually finished playing.
 *
 * `onEnd` is driven by the element's own `ended` event rather than a
 * timer, because a clip finishes later than its file duration says: the
 * delay before sound starts pushes the end out with it. Chaining on
 * `duration + gap` measured from the `play()` call therefore started the
 * next clip while the current one was still sounding -- roughly 150ms
 * early here, and further over a slower connection, which is what made
 * short words fade in and out or vanish entirely.
 */
function playNow(url: string, onEnd: () => void) {
  const audio = clipFor(url)
  if (!audio) {
    onEnd()
    return
  }
  current = audio
  audio.onended = onEnd
  // A missing or undecodable clip must not wedge the queue.
  audio.onerror = onEnd
  try {
    audio.currentTime = 0
  } catch {
    // Not seekable yet; it will start from the beginning anyway.
  }
  void audio.play().catch(() => {
    // Autoplay blocked or clip missing -- carry on silently. The
    // fall-back timer in `advance` keeps the queue moving.
  })
}

/**
 * Starts the next clip in the queue, or lets the channel fall silent.
 *
 * The wait is the clip's own measured length rather than one constant:
 * the instruction and the target word used to be chained on a fixed
 * 600ms delay, which is shorter than "Find the word" (1.2s), so the word
 * cut the instruction off every round -- the child heard "Find the" and
 * then a word, which is not an instruction at all.
 */
function advance(): void {
  clearDrain()
  const next = queue.shift()
  if (!next) {
    speaking = false
    return
  }
  const token = generation
  speaking = true

  // Whichever of the two arrives first wins, once.
  let settled = false
  const finished = () => {
    if (settled || token !== generation) return
    settled = true
    clearDrain()
    drain = window.setTimeout(() => {
      if (token !== generation) return
      drain = null
      advance()
    }, GAP_MS)
  }

  playNow(next.url, finished)

  // Safety net only. If `ended` never arrives -- a blocked autoplay, a
  // clip that 404s, a decode the browser gives up on -- the queue still
  // moves on, a beat later than the clip's measured length to allow for
  // the delay before sound starts.
  drain = window.setTimeout(finished, clipDurationMs(next.url) + STARTUP_GRACE_MS)
}

/**
 * Stop talking and forget everything queued.
 *
 * This is what makes leaving a session safe: nothing a child walked away
 * from may speak over the map. Every exit from play goes through a clip
 * of its own ("Go back"), which interrupts, and this is the same door
 * without a clip behind it.
 */
export function silence(): void {
  generation += 1
  queue = []
  clearDrain()
  speaking = false
  if (current) {
    current.onended = null
    current.onerror = null
    current.pause()
    current = null
  }
}

/** Interrupt whatever is playing and take the channel. */
function takeChannel(urls: readonly string[]): () => void {
  silence()
  const gen = generation
  const token = nextToken++
  queue = urls.map((url) => ({ url, token }))
  advance()
  // Cancelling an interrupting call silences the channel -- but only if
  // it still owns it. Something that interrupted *us* in the meantime is
  // the child's more recent intent and is left alone.
  return () => {
    if (gen === generation) silence()
  }
}

/**
 * Speaks one clip, cancelling anything already playing, so a child who
 * taps twice hears one voice rather than two. Returns a cancel function;
 * callers that simply want to be heard may ignore it.
 */
export function speak(url: string): () => void {
  return takeChannel([url])
}

/**
 * Speaks clips back to back, each starting only once the one before it
 * has finished, cancelling anything already playing first. Returns a
 * cancel function.
 */
export function speakSequence(urls: readonly string[]): () => void {
  return takeChannel(urls)
}

/**
 * Speaks clips after everything already playing and already queued.
 * Returns a cancel function that withdraws this call's clips and nothing
 * else -- an unmounting round drops its own pending word without cutting
 * short the celebration that unmounted it.
 */
export function enqueue(urls: readonly string[]): () => void {
  const token = nextToken++
  for (const url of urls) queue.push({ url, token })
  if (!speaking) advance()
  return () => {
    queue = queue.filter((clip) => clip.token !== token)
  }
}

/**
 * Stable across renders -- these are module functions, so a component may
 * safely list `speak` in an effect's dependencies.
 */
const AUDIO = { speak, speakSequence, enqueue, silence } as const

export function useAudio() {
  return AUDIO
}
