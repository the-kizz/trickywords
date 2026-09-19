/**
 * The eight avatar cut-outs delivered for this app, committed as WebP
 * under `public/avatars/` and served from there. There is no runtime
 * call to any avatar service and no network fetch: the app runs on a
 * home server with no internet access.
 *
 * A pre-reader cannot use a letter as an identity -- "F" and "O" mean
 * nothing to a five-year-old who cannot read. A distinct, friendly
 * animal does.
 */
export type AvatarId =
  | 'bear' | 'cat' | 'fox' | 'frog' | 'owl' | 'panda' | 'penguin' | 'rabbit'

export const AVATAR_IDS: AvatarId[] = [
  'bear', 'cat', 'fox', 'frog', 'owl', 'panda', 'penguin', 'rabbit',
]

export const AVATAR_LABELS: Record<AvatarId, string> = {
  bear: 'Bear', cat: 'Cat', fox: 'Fox', frog: 'Frog',
  owl: 'Owl', panda: 'Panda', penguin: 'Penguin', rabbit: 'Rabbit',
}

function isAvatarId(value: string): value is AvatarId {
  return (AVATAR_IDS as string[]).includes(value)
}

interface Props {
  /** A profile or guest's stored avatar id -- may be unknown or legacy data. */
  avatar: string
  size?: number
  className?: string
}

/** A friendly, featureless round face -- used only when an id is not recognised. */
function FallbackFace({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Friend"
      className={className}
    >
      <circle cx="50" cy="50" r="48" fill="#CBD5F5" opacity={0.5} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="#CBD5F5" strokeWidth="3" />
      <circle cx="38" cy="46" r="5" fill="#2E2A2A" />
      <circle cx="62" cy="46" r="5" fill="#2E2A2A" />
      <path d="M38 64 Q50 72 62 64" stroke="#2E2A2A" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/**
 * One cut-out per id, drawn inside a square box with `object-fit:
 * contain` -- deliberately not sized by width.
 *
 * Seven of the eight subjects fill about 85-88% of their canvas, but the
 * rabbit is 64% wide and 88% tall: it is a narrow subject with upright
 * ears, correctly framed on its longest axis. Sizing by width would
 * either stretch it or, once corrected, draw it noticeably larger than
 * the other seven. `contain` fits whichever axis is longer, so all eight
 * read as the same size and none is distorted.
 *
 * An id this component does not recognise -- an avatar from an earlier
 * placeholder set still stored against a profile in a live database, for
 * instance -- renders `FallbackFace`, never a broken image.
 */
export function Avatar({ avatar, size = 72, className }: Props) {
  const id = isAvatarId(avatar) ? avatar : null

  if (!id) return <FallbackFace size={size} className={className} />

  return (
    <img
      src={`/avatars/avatar-${id}.webp`}
      alt={AVATAR_LABELS[id]}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      className={className}
    />
  )
}
