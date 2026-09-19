/**
 * Every instruction a child needs, as speech. A pre-reader must never be
 * blocked by text they cannot read.
 *
 * Nothing here tells a child they were wrong — a miss produces an
 * invitation to try again, never a correction.
 */
export const PHRASES = {
  findTheWord: 'Find the word',
  tryAgain: 'Have another go',
  wellDone: 'Well done!',
  whosPlaying: "Who's playing?",
  pickYourFriend: 'Pick your friend.',
  buildTheWord: 'Build the word',

  // "Where's the heart?" -- the round that asks what is tricky about a
  // word rather than which word it is. LLLL's own correction step
  // ("remind students of the tricky part of the spelling") as a round,
  // and the only one that teaches *why* a word is a heart word.
  whereIsTheHeart: "Where's the tricky part?",
  allDone: 'All done! Great playing.',

  // The "Say it" round: the child sees the word alone, says it out loud,
  // then taps to hear it and decides for themselves whether they had it.
  // There is no microphone anywhere in this app and there should not be.
  sayIt: 'Say it out loud',

  // Spoken by the quiet Back control that leaves a running session
  // (`SessionRunner`) -- the way out a child had no way of finding
  // before.
  goBack: 'Go back',

  // The celebration's own invitation. A child had to go back to the map
  // and tap the same island again to keep playing, which is asking a
  // five-year-old to go backwards to go forwards; "Again" is the big
  // control on the celebration now and this is how a pre-reader learns
  // it is there.
  again: 'Again?',

  // Said once, on the celebration of a go in which every word on the
  // island was credited -- so there is nothing left today that can move
  // a box. It has to be true and it has to leave the door open: the day
  // floor is what stops a second go crediting anything twice, not a
  // refusal, and a child who wants to keep playing may.
  todaysWordsDone: "That's today's words. Play again if you like.",
} as const

/*
 * Eleven keys were removed with the five games they belonged to: the
 * chooser's "Pick a game" and its eight spoken tile names, Word Swat's,
 * Bingo's, Memory Pairs' and Spot the Word's instructions, Treasure
 * Hunt's "Keep looking", and `listen` / `yourTurn`, which nothing had
 * spoken for some time. Their clips are still committed under
 * `public/audio/phrases/` -- nothing under `public/audio` is deleted --
 * but nothing ships them any more.
 */

export type PhraseKey = keyof typeof PHRASES

// Populated once, client-side, by family play surfaces that have a
// parent-recorded clip on file (see `/api/parent/voice`). Guest play
// never calls `setVoiceOverrides`, so it always gets the bundled clip --
// consistent with guest mode never talking to the server for anything
// else either. Empty by default, so `wordAudioUrl` is pure and
// deterministic wherever nothing has been recorded.
let voiceOverrides: ReadonlySet<string> = new Set()

/** Called once a family play surface knows which words have a parent recording. */
export function setVoiceOverrides(wordIds: readonly string[]): void {
  voiceOverrides = new Set(wordIds)
}

export const wordAudioUrl = (audioId: string) =>
  voiceOverrides.has(audioId) ? `/api/parent/voice/${audioId}` : `/audio/words/${audioId}.ogg`
export const phraseAudioUrl = (key: PhraseKey) => `/audio/phrases/${key}.ogg`

/**
 * A reading of the word's example sentence. The sentence used to be shown
 * to a child who could not read it yet, which made it decoration; heard,
 * it is the word doing its job in a real sentence.
 */
export const sentenceAudioUrl = (audioId: string) => `/audio/sentences/${audioId}.ogg`
