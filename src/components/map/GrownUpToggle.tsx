'use client'
import { ADULT_TARGET_PX } from '@/lib/constants'

/**
 * "A grown-up is here" -- one switch, on the map, for the adult.
 *
 * It is not a mode, a login or a lock. There is exactly one thing it
 * changes: in a Read it round, who says whether they read the word. On
 * their own they judge and it cannot promote the word, because a
 * five-year-old's account of their own reading is not evidence. With a
 * grown-up it is the grown-up, and that does promote, because an adult
 * watching them read a word off the screen is the school's own
 * assessment -- see `ReadIt`.
 *
 * So it sits in the open rather than behind the parent PIN. The PIN
 * keeps little hands out of settings that matter; this is a fact about
 * the room that the person in the room states, and the worst a child can
 * do by pressing it is put themselves in front of questions meant for an
 * adult, which they will simply not answer.
 *
 * Deliberately adult-sized and plainly worded, so it reads as not-theirs
 * beside the big clay islands.
 */
export function GrownUpToggle(
  { here, onChange }: { here: boolean; onChange: (here: boolean) => void },
) {
  return (
    <label
      className="flex items-center gap-3 rounded-clay border-2 border-border bg-card
        px-4 cursor-pointer select-none text-sm font-semibold text-muted-foreground
        focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-fun"
      style={{ minHeight: ADULT_TARGET_PX }}
    >
      <input
        type="checkbox"
        data-testid="grown-up-toggle"
        checked={here}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 cursor-pointer accent-fun"
      />
      <span>
        A grown-up is here
        <span className="block font-normal text-xs">
          {here
            ? 'You’ll be asked whether they read each word.'
            : 'Turn this on to listen to them read and have it count.'}
        </span>
      </span>
    </label>
  )
}
