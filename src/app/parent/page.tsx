import { notFound } from 'next/navigation'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { listProfiles } from '@/lib/db/profiles'
import { loadProgress, getSetting, getSchoolSetId } from '@/lib/db/progress'
import { loadWordSets } from '@/lib/words/store'
import { ParentArea } from '@/components/parent/ParentArea'
import type { WordProgress } from '@/lib/engine/types'

// Profiles, progress, the PIN status and the word sets can all change
// between visits, so this page is read fresh on every request rather
// than baked into a static build.
export const dynamic = 'force-dynamic'

/**
 * The only screen in the app aimed at an adult.
 *
 * `notFound()` fires immediately in public mode -- there is no parent
 * database in a public deployment, and this route must not exist there
 * at all (see `src/middleware.ts` for the defence-in-depth guard on top
 * of this).
 */
export default async function ParentPage() {
  if (isPublicMode()) notFound()

  const db = getDb()
  const profiles = listProfiles(db)
  const progressByProfile: Record<number, Record<string, WordProgress>> = {}
  const schoolSetByProfile: Record<number, number | null> = {}
  for (const profile of profiles) {
    progressByProfile[profile.id] = Object.fromEntries(loadProgress(db, profile.id))
    schoolSetByProfile[profile.id] = getSchoolSetId(db, profile.id)
  }
  const sets = await loadWordSets()
  const pinIsSet = getSetting(db, 'pinHash') !== null

  return (
    <ParentArea
      profiles={profiles}
      progressByProfile={progressByProfile}
      schoolSetByProfile={schoolSetByProfile}
      sets={sets}
      pinIsSet={pinIsSet}
    />
  )
}
