# Voice decisions

How each word is spoken, and who decided. Kept because these are teaching
decisions, not engineering ones: the parent using the app with their child
makes them, and a future regeneration must not quietly undo them.

**Engine:** MeloTTS `EN-AU` (MIT licence) — the only open engine with an
Australian English speaker. Rendered in a Python 3.11 container; see
`scripts/melo-jobs.ts` for the recipe.

**Speed:** `0.60` throughout. Chosen by ear on "Find the word".

0.85 was tried for single words after "was" was described as sounding
digital, and reverted: at 0.85 the words are too fast. The digital quality
turned out to be the clip edges, not the speed — see below — and one word
judged in a quality test was not a mandate to change every word.

**Clip edges:** 3ms fade at each cut. A cut through a waveform mid-cycle is a
step change and a step change is a click — a large part of what "sounds
digital" usually is.

## Words where the dictionary form is wrong

A word read from a card is stressed, so the dictionary form is normally right.
These are the exceptions: their dictionary form is a sound a child will never
meet as that word on a page.

| Word | Ships as | Why | Decided |
|---|---|---|---|
| a | "uh" | Dictionary form is "ay", the letter name. Every sentence reads it as "uh". | operator, by ear |
| the | "thuh", 395ms | Dictionary form is "thee", only right before a vowel. From a comma carrier, which keeps the voiced "th". Stretching it further was tried and sounded wrong. | operator, by ear |
| could | "kood" (respelt) | The engine mangled the plain spelling. Not a schwa question. | operator, by ear |

## Words with two possible forms, judged one at a time

Dictionary form unless noted. "Reading form" is the reduced version heard
inside a sentence.

| # | Word | Dictionary | Reading | Chosen |
|---|---|---|---|---|
| 1 | was | woz | wuhz | **dictionary**, 770ms |
| 2 | you | yoo | yuh | **dictionary**, 520ms, cut before the full stop |
| 3 | to | too | tuh | **dictionary**, drawn out (comma carrier) |
| 4 | are | ar | uh | **dictionary**, drawn out (comma carrier) |
| 5 | has | haz | huhz | **dictionary**, spelt "has", drawn out |
| 6 | her | her | huh | **dictionary**, Australian (no audible r) |
| 7 | them | them | thuhm | **dictionary**, 395ms (speed 0.85) |
| 8 | there | thair | thuh | **dictionary**, 420ms (speed 0.55) |
| 9 | of | ov | uhv | **spelt "off"**, 270ms (speed 0.70) — see note |
| 10 | as | az | uhz | **dictionary**, spelt "az", 540ms — tail shortened |
| 11 | do | doo | duh | **dictionary**, 435ms (speed 0.75) |
| 12 | some | sum | suhm | **dictionary**, 630ms |
| 13 | for | for | fuh | **dictionary**, 430ms |

The other 41 of the 56 words have only one possible pronunciation.

### Note on "of"

Rendered from the spelling "off", chosen by ear against the plain spelling and
against "ov". This gives an /f/ ending where the word has a /v/: "of" is /ov/,
"off" is /of/, and they are different words. The operator was told this before
choosing and chose it anyway, so it is deliberate rather than an oversight.

Worth knowing if it is ever revisited: the read-aloud sentences pronounce "of"
naturally as /ov/, so a child meets one sound on the card and the other in the
sentence. Reverting is a one-line change to the table in `scripts/melo-jobs.ts`.

### Note on "go"

Kept as the plain rendering, 620ms, knowing it sounds closer to "ko" than to
"go". Not for want of trying: a longer run-up before the burst, the spellings
"goh"/"gow"/"goe", a voiced word before it, and the word lifted out of "Let's
go to the shops" were all compared by ear and none was better.

It is not a fault in the voice. English devoices word-initial /b, d, g/, and
"go" is the example the textbooks use; real speakers do the same. It sounds
right inside a sentence because the prosody carries it, and that is precisely
what is lost when a word is cut out to stand alone.

If it matters later, a parent recording of this one word through the parent
area will beat any synthesis of it.

## Technique notes

**Respelling loses the voiced "th".** English spells two sounds with "th":
voiced in *the, them, there*, unvoiced in *thumb, think*. Text-to-speech
resolves it by a rule that voices it at the start of *function words* — so
respelling "the" as "thuh" makes it a nonsense word and the engine gives the
unvoiced sound. Those words come from a carrier phrase instead.

**Carrier phrases need a stop consonant next.** The word is cut out at the
silence the following consonant opens. "there now" gives no silence — a nasal
has none — so it must be "there goes".

**Drawing a short word out: a comma carrier.** Some words come out too quick
to take in -- "to" is 200ms, which is right but unhearable. Three routes were
tried:

1. *Time-stretching the audio afterwards* -- rejected by ear. Smears, worst on
   fricatives, because it smears a short word rather than making a long one.
2. *Slower synthesis.* This does work, contrary to an earlier note here:
   VITS scales phoneme durations uniformly, so "to" goes 200ms -> 325ms at
   speed 0.45. The earlier claim that it does not came from measuring a word
   inside a carrier phrase, where it is reduced by position anyway -- a
   confounded test.
3. **A comma carrier, and this is what ships.** Render "to, to." and cut the
   first one out. English lengthens a word before a comma, so the model speaks
   it long of its own accord: 295ms, no artefacts, and the word keeps whatever
   pronunciation it has in real speech.

Route 3 also suits the "th" words, since the word stays a real function word
and keeps its voicing.

**The r is meant to be inaudible.** Australian English is non-rhotic: /r/ is
pronounced only before a vowel, so it is heard in "red" but not at the end of
"her", "for", "are", "there", "were" or "or". An audible final r would be an
American pronunciation. Four versions of "her" were compared -- plain
Australian, Australian with a linking r (cut from "her arm", where a following
vowel does make it sound), a respelling, and the American speaker -- and plain
Australian was chosen. The guidance agrees: teach the sound the word makes in
the child's own speech, since a mismatch between the accent of instruction and
the child's own is itself a cause of difficulty.

**But do not let a voiced fricative drone.** The /z/ of "az" held for 160ms
reads as a buzz rather than a consonant. Shortened to 540ms with a 35ms fade
out, which keeps the z audible without letting it hang. The opposite failure
to the one below, and both were found by ear.

**Keep the tail on a fricative.** A word ending in /s/ or /z/ -- "has", "is",
"was", "as", "his", "this" -- fades below any sane detection threshold before
it has actually stopped, so cutting at the detected boundary shears the end
off. The cut keeps 70ms past the boundary. Heard as "has" with its "z"
missing, which is how it was found.
