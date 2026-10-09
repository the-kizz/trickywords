import { NextResponse } from 'next/server'
import { isPublicMode } from '@/lib/mode'
import { deleteVoice, isSafeWordId, readVoice, saveVoice } from '@/lib/parent/voices'

const notFound = () => new NextResponse('Not found', { status: 404 })

interface Props {
  params: Promise<{ wordId: string }>
}

/** Serves a parent's recorded clip for one word, if one has been saved. */
export async function GET(_req: Request, { params }: Props) {
  if (isPublicMode()) return notFound()
  const { wordId } = await params
  const data = await readVoice(wordId)
  if (!data) return notFound()
  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': 'audio/webm', 'Cache-Control': 'no-store' },
  })
}

/** Saves a parent's recording (raw audio bytes) for one word. */
export async function POST(req: Request, { params }: Props) {
  if (isPublicMode()) return notFound()
  const { wordId } = await params
  if (!isSafeWordId(wordId)) return new NextResponse('Invalid word id', { status: 400 })
  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length === 0) return new NextResponse('Empty recording', { status: 400 })
  await saveVoice(wordId, buf)
  return NextResponse.json({ ok: true })
}

/** Removes a parent's recording, reverting the word to the bundled clip. */
export async function DELETE(_req: Request, { params }: Props) {
  if (isPublicMode()) return notFound()
  const { wordId } = await params
  await deleteVoice(wordId)
  return NextResponse.json({ ok: true })
}
