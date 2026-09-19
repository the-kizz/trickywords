import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { createProfile, deleteProfile, listProfiles } from '@/lib/db/profiles'

const notFound = () => new NextResponse('Not found', { status: 404 })

export async function GET() {
  if (isPublicMode()) return notFound()
  return NextResponse.json({ profiles: listProfiles(getDb()) })
}

export async function POST(req: Request) {
  if (isPublicMode()) return notFound()
  const body = (await req.json()) as { name?: string; avatar?: string }
  if (!body.name || !body.avatar) {
    return new NextResponse('name and avatar are required', { status: 400 })
  }
  const profile = createProfile(getDb(), { name: body.name, avatar: body.avatar })
  return NextResponse.json({ profile }, { status: 201 })
}

export async function DELETE(req: Request) {
  if (isPublicMode()) return notFound()
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse('a valid id is required', { status: 400 })
  }
  deleteProfile(getDb(), id)
  return NextResponse.json({ ok: true })
}
