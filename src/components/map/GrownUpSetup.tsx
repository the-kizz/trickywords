import { ADULT_TARGET_PX } from '@/lib/constants'
import type { ReactNode } from 'react'

/**
 * The two things an adult sets once -- where the child is up to, and
 * which set the class is on -- closed until opened, in a line beside the
 * grown-up switch.
 *
 * They lived at the foot of the map inside the long list of every
 * island's words, which is gone (see `IslandWords`). Up here they are
 * where a parent is already looking when they arrive, and closed so the
 * child's map does not start with a form.
 */
export function GrownUpSetup({ children }: { children: ReactNode }) {
  return (
    <details
      data-testid="grown-up-setup"
      className="w-full max-w-md rounded-clay border-2 border-border bg-card/70 px-4 mb-3"
    >
      <summary
        className="flex items-center cursor-pointer select-none text-sm font-semibold
          text-muted-foreground
          focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        style={{ minHeight: ADULT_TARGET_PX }}
      >
        Set up for your child
      </summary>
      {children}
    </details>
  )
}
