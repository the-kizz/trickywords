import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { saveProgress, setLastSetId, setGrownUpHere } from '@/lib/db/progress'
import { raiseBestKnown } from '@/lib/db/profiles'

export async function POST(req: Request) {
  // Public mode makes no writes of any kind.
  if (isPublicMode()) return new NextResponse('Not found', { status: 404 })
  const {
    profileId, progress, progressBatch, bestKnown, lastSetId, grownUp,
  } = await req.json()
  const db = getDb()
  const id = Number(profileId)
  // Either half may be sent on its own: an answer carries progress, and
  // a high-water mark that rose on the final round of a session is sent
  // by itself rather than waiting for an answer that never comes.
  if (progress) saveProgress(db, id, progress)
  // A whole session's worth at once. Every word's review countdown is
  // decremented when a session ends, and that was held in React state and
  // never written: the schedule on disk therefore never advanced, so after
  // any reload nothing was ever due and the map said so. One request
  // rather than fifty-six.
  if (Array.isArray(progressBatch)) {
    for (const row of progressBatch) if (row) saveProgress(db, id, row)
  }
  // The island they are on, written as a session starts. Held in React
  // state alone it was gone on the next reload, and the map then put the
  // companion, the pulse and the next session back on Set 1 whatever they
  // had actually been playing -- see `currentSet`.
  if (typeof lastSetId === 'number' && Number.isInteger(lastSetId) && lastSetId > 0) {
    setLastSetId(db, id, lastSetId)
  }
  // Whether a grown-up is sitting with them. Kept so an evening of
  // reading together does not have to be declared again every session.
  if (typeof grownUp === 'boolean') setGrownUpHere(db, id, grownUp)
  // The companion and the sticker book are drawn from this mark.
  // `raiseBestKnown` never lowers it.
  if (typeof bestKnown === 'number' && Number.isFinite(bestKnown)) {
    raiseBestKnown(db, id, Math.floor(bestKnown))
  }
  return NextResponse.json({ ok: true })
}
