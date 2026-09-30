'use client'
import { ADULT_TARGET_PX } from '@/lib/constants'
import type { WordSet } from '@/lib/words/types'

interface Props {
  sets: WordSet[]
  /**
   * The highest set such that every set up to it is fully known, or null
   * when Set 1 is not. Derived from progress, so it reflects the truth
   * whether that came from this control or from play.
   */
  value: number | null
  onChange: (upToSetId: number | null) => void
}

/**
 * "Already knows sets up to" -- an adult saying where this child is.
 *
 * The public page is the one actually used, and a child part-way
 * through the year used to arrive on it as a beginner: every word at box
 * 0, two choices, the word shown first, on sets they finished months
 * ago. The parent area has always had a starting point for exactly this;
 * the guest map had nothing. Now it does.
 *
 * It marks every word up to the chosen set as known and lands the map on
 * the set after, which is where a child who knows sets 1-N belongs. A
 * word that already has progress is left alone -- see
 * `setStartingPoint` in `GuestHome` for why that differs from the family
 * version. Choosing a lower set than the one shown does nothing: what is
 * known cannot be un-known from here, and "Start again" is the reset.
 *
 * Adult-sized, plainly worded, inside the adult disclosure beside the
 * class picker: never a control a child meets on the way to an island.
 */
export function StartingPointPicker({ sets, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-border pt-3 pb-4">
      <label
        htmlFor="starting-point"
        className="text-sm font-semibold text-muted-foreground flex items-center"
        style={{ minHeight: ADULT_TARGET_PX }}
      >
        Already knows sets up to
      </label>
      <select
        id="starting-point"
        data-testid="guest-starting-point"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{ minHeight: ADULT_TARGET_PX }}
        className="rounded-clay border-2 border-border px-3 bg-card text-sm cursor-pointer
          focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
      >
        <option value="">Not set</option>
        {sets.map((set) => (
          <option key={set.id} value={set.id}>{set.name}</option>
        ))}
      </select>
      <p className="w-full text-sm text-muted-foreground leading-normal">
        Marks those words as known, so play starts at the right level and
        the map lands on the next set. Words already played are left as
        they are. Kept on this device.
      </p>
    </div>
  )
}
