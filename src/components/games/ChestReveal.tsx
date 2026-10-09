'use client'
import { motion } from 'motion/react'
import { useReducedMotion } from '@/lib/useReducedMotion'

/**
 * How long the treasure stays on screen before the round moves on.
 *
 * The reveal has to be *seen*: the round used to hand itself back on the
 * correct tap, which would replace the chest with whatever comes next in
 * the same commit. Long enough to register, short enough that it never
 * reads as waiting -- and "Well done!" is already playing over it.
 */
export const CHEST_REVEAL_MS = 900

/**
 * The lowest box at which being right opens the chest.
 *
 * Kept off the early boxes on purpose. A brand-new word's rounds are
 * about bonding a form to a sound and they are already long -- the word
 * is shown, spoken and taken away before the choices arrive -- so a
 * reward animation on top of that is another second of not-reading. From
 * box 3 the word is being *reviewed* rather than met, the round is
 * quick, and there is room for being right to feel like something.
 */
export const CHEST_REVEAL_BOX = 3

/**
 * An open chest with a gold star in it: the one thing Treasure Hunt was
 * right about, kept as Find it's own reward for a correct answer on a
 * word the child has been carrying for a while.
 *
 * It is a moment, not a control. Nothing here is tappable, nothing here
 * is announced (the round's spoken "Well done!" is what a child who
 * cannot see the screen gets), and under `prefers-reduced-motion` the
 * star simply appears instead of springing in -- the state change still
 * happens, only the easing goes away.
 */
export function ChestReveal() {
  const reducedMotion = useReducedMotion()
  return (
    <div
      data-testid="chest-reveal"
      aria-hidden="true"
      className="flex flex-col items-center"
    >
      {/* The lid, tilted back because the chest is open. */}
      <span
        className="flex items-center justify-center w-24 h-6
          rounded-t-2xl border-4 border-b-0 border-border bg-card
          origin-bottom-left -rotate-12"
      />
      <span
        className="flex h-[3.25rem] w-24 items-center justify-center
          rounded-b-2xl border-4 border-border bg-background/40"
      >
        <motion.span
          data-testid="treasure"
          className="block"
          initial={reducedMotion ? false : { scale: 0.3, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
        >
          {/* A gold star, drawn here rather than commissioned. */}
          <svg viewBox="0 0 24 24" className="w-10 h-10">
            <path
              d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.6l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9L12 2.5z"
              fill="#FBBF24"
              stroke="#B45309"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </span>
    </div>
  )
}
