import { notFound, redirect } from 'next/navigation'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { getProfile } from '@/lib/db/profiles'
import { getLastSetId, getSchoolSetId, getGrownUpHere, loadProgress } from '@/lib/db/progress'
import { loadWordSets } from '@/lib/words/store'
import { FamilyPlay } from '@/components/family/FamilyPlay'
import { dayKey } from '@/lib/engine/ladder'

// Reads the profile and their progress at request time -- both can
// change between visits and must never be baked into a static build.
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ profileId: string }>
}

/**
 * Family play for one named child. The family home already links here
 * as `/play/{profile.id}`.
 *
 * Public mode carries no family database at all (see `src/middleware.ts`
 * for the primary control on the API routes this page depends on), so
 * this route sends a public visitor straight back to the guest surface
 * rather than trying to look up a profile that cannot exist.
 */
export default async function FamilyPlayPage({ params }: Props) {
  if (isPublicMode()) redirect('/play')

  const { profileId } = await params
  const id = Number(profileId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const db = getDb()
  const profile = getProfile(db, id)
  if (!profile) notFound()

  const progress = loadProgress(db, id)
  const sets = await loadWordSets()

  return (
    <FamilyPlay
      profileId={id}
      profileName={profile.name}
      profileAvatar={profile.avatar}
      sets={sets}
      initialProgress={Object.fromEntries(progress)}
      bestKnown={profile.bestKnown}
      lastSetId={getLastSetId(db, id)}
      schoolSetId={getSchoolSetId(db, id)}
      grownUpHere={getGrownUpHere(db, id, dayKey())}
    />
  )
}
