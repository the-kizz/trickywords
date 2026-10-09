import { APP_NAME } from '@/lib/constants'

/** Intrinsic size of `wordmark-blue.svg`, for the aspect ratio only. */
const WORDMARK_WIDTH = 1259
const WORDMARK_HEIGHT = 302

interface Props {
  /**
   * Extra classes for the wrapper, so a screen can cap the width it
   * gives the wordmark. Always keep a `max-w-*`: at full width on a
   * phone the wordmark would be the whole screen.
   */
  className?: string
}

/**
 * The app name, as the wordmark rather than as text.
 *
 * Deliberately a plain `<img>` of the SVG, not `next/image` and not an
 * inlined `<svg>`:
 *
 *   - `next/image` would route it through `/_next/image`, which does not
 *     optimise SVG anyway and would put a query-string URL in front of
 *     an asset that is already 9 KB and resolution-independent.
 *   - Inlining the paths would put ~9 KB of vector data into every HTML
 *     response instead of one cacheable file.
 *
 * `alt` carries the accessible name, so a screen reader still announces
 * "Tricky Words" where it used to read the text heading. `width`/
 * `height` are the intrinsic ratio only -- the rendered size comes from
 * the caller's `max-w-*` -- and they are what stops the pale ground
 * reflowing as the image arrives.
 */
export function Wordmark({ className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/wordmark-blue.svg"
      alt={APP_NAME}
      width={WORDMARK_WIDTH}
      height={WORDMARK_HEIGHT}
      className={`w-full h-auto ${className ?? ''}`}
    />
  )
}
