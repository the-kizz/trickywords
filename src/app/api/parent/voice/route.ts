import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { listVoiceIds } from '@/lib/parent/voices'

/** Which words currently have a parent-recorded clip saved. */
export async function GET() {
  if (isPublicMode()) return new NextResponse('Not found', { status: 404 })
  return NextResponse.json({ wordIds: await listVoiceIds() })
}
