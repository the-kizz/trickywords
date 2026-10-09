import { NextResponse } from 'next/server'
import { resolveMode } from '@/lib/mode'
import { SURFACE_HEADER, isPublicSurfaceHeader } from '@/lib/public-surface.mts'
import { APP_NAME } from '@/lib/constants'

/**
 * Reports the surface this request arrived on, not just the container's
 * mode: a family-mode container also serves the guest surface when
 * `TRICKYWORDS_PUBLIC` is set, and a caller needs to be able to tell
 * which of the two published ports it is actually talking to.
 */
export async function GET(req: Request) {
  const mode = isPublicSurfaceHeader(req.headers.get(SURFACE_HEADER))
    ? 'public'
    : resolveMode(process.env)
  return NextResponse.json({ app: APP_NAME, mode, ok: true })
}
