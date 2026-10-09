import type { Word } from '@/lib/words/types'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'

/**
 * Either a whole word (which can carry hearts) or one piece of text --
 * a grapheme tile, a word inside a sentence with its own punctuation.
 * The text form exists so that *every* word on screen goes through this
 * component and gets its typography and its size floor, rather than
 * some games rendering a bare span and inheriting the button's much
 * smaller font (Spot the Word's sentence was measured at ~20px against
 * Listen and Find's 82px).
 */
type Props = {
  showTricky?: boolean
  size?: 'md' | 'lg'
} & (
  | { word: Word; text?: never }
  | { text: string; word?: never }
)

// Fluid sizing: the word is the lesson, so it must scale up generously
// from phone through tablet to desktop rather than sitting pinned at one
// size. `lg` is the on-screen target word itself (must read as the
// clearly largest thing on an iPad); `md` is for secondary word tiles
// (choice buttons, drifting words, card faces, sentence words) that
// still need to be comfortably legible without competing with the
// target.
//
// The `md` floor is 36px rather than 28px because the word must never
// be the smallest text on screen. Measured across the games before
// this, the same word rendered at 82px in Listen and Find, ~37px in
// Word Swat and Bingo, 30px on a Memory Pairs card and ~20px in Spot
// the Word's sentence -- smaller than the instruction above it.
const SIZE_CLASS: Record<'md' | 'lg', string> = {
  md: 'text-[clamp(2.25rem,5vw,3.5rem)]',
  lg: 'text-[clamp(3rem,8vw,5.25rem)]',
}

/**
 * One stretch of a word that is marked, or unmarked, as a whole.
 *
 * `trickyIndices` names graphemes, but a heart marks a *part of a word*,
 * and three of the fifty-six default words have two tricky graphemes
 * side by side -- `was` (w[a][s]), `are` ([a][re]), `were` (w[e][re]).
 * One heart per grapheme drew two hearts on those, close enough to fuse
 * into one lumpy double shape: measured at 390px wide, `was`'s hearts
 * overlapped by 11px, and by 15px at 820px. Grouping contiguous tricky
 * graphemes into one run gives each run a single heart, centred over it
 * -- one over the `as` of `was`, one over the `ere` of `were`, one over
 * the whole of `are`, which is what a teacher would draw.
 *
 * Non-adjacent tricky graphemes stay separate, and that is correct
 * rather than a limitation: in `one`, `some` and `come` the o and the e
 * are separately irregular and are not one unit. They measure about
 * 30px apart at 390px and read cleanly. Only runs merge.
 */
export interface WordRun {
  /** Index of the run's first grapheme, which names its heart. */
  start: number
  graphemes: string[]
  tricky: boolean
}

/** Groups a word's graphemes into contiguous tricky and untricky runs. */
export function trickyRuns(
  segments: readonly string[],
  trickyIndices: readonly number[],
): WordRun[] {
  const tricky = new Set(trickyIndices)
  const runs: WordRun[] = []
  segments.forEach((g, i) => {
    const isTricky = tricky.has(i)
    const last = runs[runs.length - 1]
    if (last && last.tricky === isTricky) last.graphemes.push(g)
    else runs.push({ start: i, graphemes: [g], tricky: isTricky })
  })
  return runs
}

/**
 * Renders a word in Andika, a typeface designed for literacy learners:
 * single-storey 'a' and 'g' match how children are taught to form letters.
 *
 * Hearts appear only on genuinely irregular graphemes. Decodable and
 * spelling-family words show no hearts, because they are not tricky, and
 * telling a child otherwise teaches them to distrust sounding out.
 *
 * The heart is the app's core teaching device -- it marks the one part
 * of the word that cannot be sounded out: one heart per contiguous run
 * of tricky graphemes, centred over the run (see `trickyRuns`). It is
 * sized and positioned in `em` units, so it always scales with the word
 * itself and stays visibly attached to the part it marks, at every size
 * this tile renders at.
 * Its bottom edge overlaps the top of the letter rather than floating
 * clear above it, so it reads as touching -- marking -- that grapheme,
 * not as a separate decoration hovering over the word (most visible on
 * a single-grapheme word like "I", where there is no neighbour to
 * anchor it visually).
 */
export function WordTile({ word, text, showTricky: wanted = false, size = 'md' }: Props) {
  // The mark is a method, not a decoration -- see `HEART_MARKS_ENABLED`.
  // Every caller still says whether it *wants* hearts, so turning the
  // method back on is one flag rather than a hunt through the callers.
  const showTricky = wanted && HEART_MARKS_ENABLED
  // A plain piece of text is one unbroken segment and never gets a
  // heart: hearts mark a grapheme of a known word, and there is no
  // grapheme analysis to stand behind one here.
  const segments = word ? word.graphemes : [text]
  const trickyIndices = word ? word.trickyIndices : []
  const runs = trickyRuns(segments, trickyIndices)

  return (
    <span
      data-testid="word-text"
      /*
        The side padding is the heart's overhang, not decoration. A heart
        is one size whatever it sits on, so over a narrow grapheme it is
        wider than its own run and hangs past it -- measured on "we", a
        57.6px heart over a 39px "e", reaching 9.3px beyond the word's
        right edge. Nothing clipped it there, but a box narrower than its
        own ink would clip outright inside any `overflow-hidden` ancestor.
        The overhang is symmetric now that the path is (see below), so
        this only has to be wide enough for the narrowest grapheme rather
        than correcting a lean.
      */
      className={`font-word font-bold inline-flex ${SIZE_CLASS[size]} ${
        showTricky ? 'mt-[0.55em] px-[0.3em]' : ''
      }`}
    >
      {runs.map((run) => (
        /*
          The run is the positioning context, so its one heart centres
          over the whole run rather than over any single grapheme of it.
        */
        <span key={run.start} className="relative inline-block">
          {showTricky && run.tricky && (
            <svg
              data-testid={`tricky-${run.start}`}
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="absolute -top-[0.37em] left-1/2 -translate-x-1/2 w-[0.72em] h-[0.72em] fill-fun drop-shadow-sm"
            >
              {/*
                Symmetric about x=12, which is the whole point of this
                path. The one before it was not: measured, its ink ran
                x=2.01 to x=17.99, putting its centre at 10.0 in a box
                whose centre is 12, with 2 units of space on the left and
                6 on the right. Centring the *box* over a grapheme
                therefore drew the heart a twelfth of its width to the
                left of the letter, and the dead right-hand third is what
                hung past the end of the word. Its right lobe was also
                visibly smaller than its left, with a step in the outline.
                Both faults were in the drawing, not in the positioning.
              */}
              <path d="M12 20.5C12 20.5 3.2 14.2 3.2 9.3C3.2 6.4 5.4 4.8 7.7 4.8C9.7 4.8 11.2 6 12 7.4C12.8 6 14.3 4.8 16.3 4.8C18.6 4.8 20.8 6.4 20.8 9.3C20.8 14.2 12 20.5 12 20.5Z" />
            </svg>
          )}
          {run.graphemes.join('')}
        </span>
      ))}
    </span>
  )
}
