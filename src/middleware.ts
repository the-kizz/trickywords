import { NextResponse, type NextRequest } from 'next/server'
import { resolveMode } from '@/lib/mode'
import {
  PUBLIC_ENTRY_PATH,
  SURFACE_HEADER,
  isPublicSurfaceHeader,
} from '@/lib/public-surface.mts'

const FAMILY_ONLY = ['/parent', '/api/parent', '/api/progress', '/api/profiles']

/**
 * Whether this path belongs to the family surface and must not be served
 * to a public request.
 *
 * `/play/<profileId>` is in here for the reason the list alone missed:
 * along with `/` it is one of the two routes that render a child's
 * *name*, the worst thing this project could leak, and both used to be
 * guarded only by `isPublicMode()` -- which reads TRICKYWORDS_MODE and
 * is `family` in a one-container deployment. For that single worst
 * outcome the listener's allowlist was therefore the only layer rather
 * than one of two.
 *
 * `/play` itself is deliberately absent: it is the guest game.
 */
function isFamilyOnly(path: string): boolean {
  // Note the trailing slash: `/play` stays, `/play/anything` does not.
  if (path.startsWith('/play/')) return true
  return FAMILY_ONLY.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * Whether this request should be treated as public.
 *
 * Two independent ways in:
 *
 *   1. `TRICKYWORDS_MODE=public` — the whole container is public-only.
 *   2. The surface header, set by the public listener in
 *      `docker/entrypoint.mjs` after stripping any inbound copy. One
 *      process now serves both surfaces, so the env var alone can no
 *      longer tell them apart.
 *
 * The header is only ever *additional* grounds to restrict a request. A
 * client that forges it restricts itself; there is no value it can send
 * that widens access, and no absence of it that unlocks anything a
 * family-mode caller could not already reach.
 */
function isPublicRequest(req: NextRequest): boolean {
  if (resolveMode(process.env) === 'public') return true
  return isPublicSurfaceHeader(req.headers.get(SURFACE_HEADER))
}

/**
 * On the public surface the family side does not exist.
 *
 * This is the second of two layers, not the primary control. The primary
 * control is the allowlist in the public listener, which refuses
 * everything it does not recognise before the request reaches Next at
 * all (see `src/lib/public-surface.mts`). This guard exists because one
 * bug in one layer should not be enough -- and between them the two
 * layers now cover every route that renders a child's name.
 */
export function middleware(req: NextRequest) {
  if (!isPublicRequest(req)) return NextResponse.next()
  const path = req.nextUrl.pathname

  // The family home renders the profile chooser -- every child's name --
  // so a public request must never reach it. It is sent to the guest
  // game rather than 404'd, which refuses it just as completely (the
  // page never renders) while keeping the root a working link. That
  // matters twice over: the guest listener already answers `/` with the
  // same redirect before Next sees it, so this agrees with the layer in
  // front of it; and a whole-container `TRICKYWORDS_MODE=public`
  // deployment -- the escape hatch SECURITY.md points at -- needs its
  // root to land on the game, not on a 404.
  if (path === '/') {
    return NextResponse.redirect(new URL(PUBLIC_ENTRY_PATH, req.nextUrl))
  }

  if (isFamilyOnly(path)) {
    return new NextResponse('Not found', { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
