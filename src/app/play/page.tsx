import { GuestHome } from '@/components/guest/GuestHome'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

// The mode flag can change between deploys and must be read at request
// time, not baked into a static build.
export const dynamic = 'force-dynamic'

/**
 * The public entry point. In public mode this is the only door into the
 * app; in family mode it is available too, for a family that would
 * rather skip named profiles and just play. Either way it never talks
 * to the server -- see `GuestHome`.
 */
export default function PlayPage() {
  return <GuestHome sets={DEFAULT_SETS} />
}
