import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { getSetting, setSetting, saveProgress, setSchoolSetId } from '@/lib/db/progress'
import { hashPin, verifyPin } from '@/lib/parent/pin'
import { seedProgressForSignedOffSets } from '@/lib/parent/starting-point'
import { loadWordSets, saveWordSets } from '@/lib/words/store'
import { wordSetSchema } from '@/lib/words/types'
import { z } from 'zod'

const notFound = () => new NextResponse('Not found', { status: 404 })
const badRequest = (message: string) => new NextResponse(message, { status: 400 })

/**
 * Everything the parent area needs from the server, gathered behind one
 * route: PIN setup/verification, word-set editing, and seeding a
 * child's starting point. Split into sub-actions rather than
 * sub-routes because they share one gate (public mode does not exist
 * here) and one shape of request/response.
 *
 * The recorded-voice endpoints live separately, at
 * `/api/parent/voice/[wordId]`, because they carry binary audio rather
 * than JSON.
 */
export async function GET() {
  if (isPublicMode()) return notFound()
  const db = getDb()
  return NextResponse.json({ pinIsSet: getSetting(db, 'pinHash') !== null })
}

const verifyPinSchema = z.object({ action: z.literal('verify-pin'), pin: z.string() })
const setPinSchema = z.object({ action: z.literal('set-pin'), pin: z.string() })
const changePinSchema = z.object({
  action: z.literal('change-pin'), currentPin: z.string(), newPin: z.string(),
})
const saveSetsSchema = z.object({ action: z.literal('save-sets'), sets: z.array(wordSetSchema) })
const seedSchema = z.object({
  action: z.literal('seed-starting-point'),
  profileId: z.number().int().positive(),
  setIds: z.array(z.number().int().positive()),
})
/**
 * Which set this child's class is working on, or `null` for "not set".
 *
 * A parent's note about school, per child -- deliberately not a gate and
 * deliberately optional: unset, the map looks exactly as it did before
 * the marker existed.
 */
const schoolSetSchema = z.object({
  action: z.literal('set-school-set'),
  profileId: z.number().int().positive(),
  setId: z.number().int().positive().nullable(),
})
const bodySchema = z.discriminatedUnion('action', [
  verifyPinSchema, setPinSchema, changePinSchema, saveSetsSchema, seedSchema,
  schoolSetSchema,
])

export async function POST(req: Request) {
  if (isPublicMode()) return notFound()

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return badRequest('Malformed request')
  const body = parsed.data
  const db = getDb()

  switch (body.action) {
    case 'verify-pin': {
      const stored = getSetting(db, 'pinHash')
      if (!stored) return NextResponse.json({ ok: false, reason: 'no-pin-set' }, { status: 409 })
      return NextResponse.json({ ok: verifyPin(body.pin, stored) })
    }

    case 'set-pin': {
      // First-run only. Once a PIN exists, changing it requires the
      // current one -- see 'change-pin' -- so a child who happens to be
      // looking at the screen while a parent is signed in cannot reset
      // it to something the parent never chose.
      if (getSetting(db, 'pinHash')) {
        return new NextResponse('A PIN is already set', { status: 409 })
      }
      const hash = safeHashPin(body.pin)
      if (!hash) return badRequest('PIN must be 4 to 8 digits')
      setSetting(db, 'pinHash', hash)
      return NextResponse.json({ ok: true })
    }

    case 'change-pin': {
      const stored = getSetting(db, 'pinHash')
      if (!stored || !verifyPin(body.currentPin, stored)) {
        return new NextResponse('Current PIN is incorrect', { status: 403 })
      }
      const hash = safeHashPin(body.newPin)
      if (!hash) return badRequest('PIN must be 4 to 8 digits')
      setSetting(db, 'pinHash', hash)
      return NextResponse.json({ ok: true })
    }

    case 'save-sets': {
      if (body.sets.length === 0) return badRequest('At least one word set is required')
      await saveWordSets(body.sets)
      return NextResponse.json({ ok: true })
    }

    case 'set-school-set': {
      setSchoolSetId(db, body.profileId, body.setId)
      return NextResponse.json({ ok: true })
    }

    case 'seed-starting-point': {
      const sets = await loadWordSets()
      const seeded = seedProgressForSignedOffSets(sets, body.setIds)
      for (const p of seeded.values()) saveProgress(db, body.profileId, p)
      return NextResponse.json({ ok: true, wordsSeeded: seeded.size })
    }
  }
}

function safeHashPin(pin: string): string | null {
  try {
    return hashPin(pin)
  } catch {
    return null
  }
}
