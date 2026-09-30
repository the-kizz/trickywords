import { ADULT_TARGET_PX } from '@/lib/constants'

/**
 * A grown-up's control, not a child's.
 *
 * Deliberately not `ClayButton`: that is built for a five-year-old's
 * finger and a child's eye, and these are read and pressed by an adult
 * looking over their shoulder. Adult-sized (`ADULT_TARGET_PX`) and worded
 * rather than iconic, and never the primary fill every answer button the
 * child has tapped all session wears -- an adult-sized blue button in the
 * child's own colour is a button a five-year-old presses. Both of these
 * are outlined on the card surface instead; the emphasis between them is
 * the border, not the fill.
 *
 * Shared by Read it and the card run because they are the same judgement
 * -- "They read it" / "Tell them" -- a minute apart, and for a while they
 * wore two visual languages: the card run's filled blue against Read
 * it's outline. Same words, same weight, same button.
 */
export function AdultButton(
  { label, ariaLabel, primary, onPress }: {
    label: string
    /** The full sentence, where the visible label is shortened to fit. */
    ariaLabel?: string
    primary?: boolean
    onPress: () => void
  },
) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      style={{ minHeight: ADULT_TARGET_PX }}
      className={`rounded-clay border-2 px-5 font-semibold cursor-pointer select-none
        focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun
        ${primary
          ? 'border-foreground bg-card text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  )
}
