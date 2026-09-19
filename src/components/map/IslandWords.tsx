import { ADULT_TARGET_PX } from '@/lib/constants'
import type { ReactNode } from 'react'
import type { WordSet } from '@/lib/words/types'

/**
 * Which island holds which words, for the adult standing over the child.
 *
 * The operator asked for this in their own words: *"A parent might say oh
 * class is up to level 7 let's practice level 7 then we can go back
 * later. So visually should see where is meant to be up to. But can
 * override. Which is why a tooltip with the words shown for each level
 * is important."* The need is a parent with the school's sheet in one
 * hand, looking for the island that holds those words -- which means
 * seeing the words **before** tapping anything.
 *
 * A tooltip is the wrong form for it, so this is not one:
 *
 *  - **No hover.** This is a tablet; there is no hover to rely on.
 *  - **Nothing tappable inside an island.** An island is the control a
 *    child taps to play, and a second target on a 76px tile is a way to
 *    start the wrong thing. This sits below the map, on its own.
 *  - **Nothing for a pre-reader to read where they are looking.** It is
 *    closed until an adult opens it, it sits under the islands rather
 *    than on them, and it is set in small muted adult type. A
 *    five-year-old chooses an island by its picture and its place on the
 *    path; the words on it are what they are about to *hear*.
 *
 * One disclosure listing every island, rather than something per island,
 * because the question is comparative -- "which of these twelve is the
 * one on my sheet?" -- and a parent answers it by scanning a list.
 *
 * It replaces the line that named the next session's words ("This time:
 * was, said, you"). Two adult lines under the map competed for the same
 * glance, and of the two this is the one the operator asked for and the
 * one that answers the question they asked: the old line named the words
 * of the session, review from other islands included, which is not
 * something a parent can match against a sheet from school. With the
 * island leading its own session, an island's words *are* what the next
 * sitting is about, and the island they are on is marked here in words.
 */
interface Props {
  sets: WordSet[]
  /** The island the child is on, so a parent can find their in the list. */
  hereId?: number
  /**
   * The island the class is working on, if an adult has said which --
   * see `SchoolSetPicker`. Marked here as well as on the map, because
   * this list is where a parent comes to check it.
   */
  schoolSetId?: number | null
  /**
   * Anything else that belongs to the adult rather than the child --
   * guest play puts its "which set is the class on?" picker here, since
   * it has no parent area to keep it in and this panel is already closed
   * until an adult opens it.
   */
  children?: ReactNode
}

const MARK = 'rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'

export function IslandWords({ sets, hereId, schoolSetId, children }: Props) {
  if (sets.length === 0) return null

  return (
    <details
      data-testid="island-words"
      className="w-full max-w-2xl rounded-clay border-2 border-border bg-card/70 px-4"
    >
      <summary
        className="flex items-center cursor-pointer select-none text-sm font-semibold
          text-muted-foreground
          focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        style={{ minHeight: ADULT_TARGET_PX }}
      >
        Which words are on each island?
      </summary>
      <p className="text-sm text-muted-foreground leading-normal mb-3">
        For you, not for them. Every island can be tapped at any time.
      </p>
      <ul className="flex flex-col gap-2 pb-4">
        {sets.map((set) => (
          <li key={set.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-muted-foreground w-14 shrink-0">
              {set.name}
            </span>
            <span className="font-word font-bold text-foreground">
              {set.words.map((w) => w.text).join(', ')}
            </span>
            {set.id === hereId && (
              <span data-testid="island-words-here" className={`${MARK} bg-muted text-muted-foreground`}>
                where they are now
              </span>
            )}
            {set.id === schoolSetId && (
              <span data-testid="island-words-school" className={`${MARK} bg-foreground text-card`}>
                class is here
              </span>
            )}
          </li>
        ))}
      </ul>
      {children}
    </details>
  )
}
