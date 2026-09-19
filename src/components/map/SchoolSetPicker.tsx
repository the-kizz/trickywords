'use client'
import { ADULT_TARGET_PX } from '@/lib/constants'
import type { WordSet } from '@/lib/words/types'

interface Props {
  sets: WordSet[]
  /** The island currently marked, or null for "not set". */
  value: number | null
  onChange: (setId: number | null) => void
}

/**
 * Where the class is up to, set by the adult standing over the child --
 * the guest half of the marker the parent area sets per child.
 *
 * Guest play has no parent area and no server, so the control has to
 * live on the map. It sits inside the adult word-list disclosure, which
 * is closed until an adult opens it, so it is never a control a child
 * meets on their way to an island.
 *
 * It is a note, not a gate. "Not set" is a real choice and the normal
 * one, and nothing about what a child may tap depends on it -- every
 * island has been tappable from the start, because different children in
 * one class are at different points.
 */
export function SchoolSetPicker({ sets, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-border pt-3 pb-4">
      <label
        htmlFor="school-set"
        className="text-sm font-semibold text-muted-foreground flex items-center"
        style={{ minHeight: ADULT_TARGET_PX }}
      >
        Which set is the class working on?
      </label>
      <select
        id="school-set"
        data-testid="guest-school-set"
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
        Marks that island on the map. Any island can still be played, any time.
        Kept on this device, for this visit only.
      </p>
    </div>
  )
}
