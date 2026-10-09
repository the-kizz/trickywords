'use client'
import { useEffect } from 'react'
import { ADULT_TARGET_PX } from '@/lib/constants'
import type { WordSet } from '@/lib/words/types'

/**
 * Which words are on this island, for the adult standing over the child.
 *
 * The operator asked for this in their own words: *"A parent might say oh
 * class is up to level 7 let's practice level 7 then we can go back
 * later... Which is why a tooltip with the words shown for each level
 * is important."* For a while it was one long disclosure under the map
 * listing all twelve islands, on the reasoning that the question is
 * comparative and a parent answers it by scanning. The operator did not
 * like the long list, and asked for the thing they had asked for in the
 * first place: an (i) on each island.
 *
 * So: each island carries a small grey (i) at its corner (see
 * `ProgressMap`), and tapping it opens this -- a sheet from the bottom
 * of the screen with that island's words, where the child is and where
 * the class is, and nothing else. Not a hover tooltip: this is a tablet.
 * Dismissed by its own Done, by the backdrop, or by Escape, and it
 * changes nothing -- it is a label, not a control.
 *
 * Still in adult register throughout: small muted type, the words in
 * the word face so a parent can match them against the school's sheet.
 * A five-year-old who taps the (i) by accident sees a card of words
 * they cannot read and a Done button; nothing is lost and nothing
 * starts.
 */
interface Props {
  set: WordSet
  /** This is the island the child is on. */
  isHere?: boolean
  /** This is the island the class is working on -- see `SchoolSetPicker`. */
  isSchool?: boolean
  onClose: () => void
}

const MARK = 'rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'

export function IslandWords({ set, isHere = false, isSchool = false, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      data-testid="island-words"
      role="dialog"
      aria-modal="true"
      aria-label={`Words on ${set.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* The backdrop: a tap anywhere outside the sheet closes it. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-foreground/30" />
      <div
        className="relative w-full max-w-2xl rounded-t-[1.5rem] border-2 border-b-0 border-border
          bg-card px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]
          text-sm text-muted-foreground"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold flex items-center gap-2 flex-wrap">
            {set.name}
            {isHere && (
              <span data-testid="island-words-here" className={`${MARK} bg-muted text-muted-foreground`}>
                where they are now
              </span>
            )}
            {isSchool && (
              <span data-testid="island-words-school" className={`${MARK} bg-foreground text-card`}>
                class is here
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: ADULT_TARGET_PX }}
            className="rounded-clay border-2 border-border bg-card px-4 font-semibold
              cursor-pointer select-none hover:text-foreground
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
          >
            Done
          </button>
        </div>
        <p className="font-word font-bold text-foreground text-lg leading-relaxed mt-2">
          {set.words.map((w) => w.text).join(', ')}
        </p>
        <p className="mt-2 leading-normal">
          For you, not for them. Every island can be tapped at any time.
        </p>
      </div>
    </div>
  )
}
