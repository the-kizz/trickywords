/**
 * The public-surface allowlist — the security boundary for the guest side.
 *
 * One container serves both surfaces, so this module is the single place
 * that decides which paths a guest on the public port may reach. It is
 * imported by three very different consumers:
 *
 *   - `docker/entrypoint.mjs`, running under plain `node` inside the
 *     container (hence `.mts`: Node strips the type annotations natively,
 *     so there is no build step and no runtime dependency)
 *   - `src/middleware.ts` and the health route, inside Next
 *   - `tests/unit/public-surface.test.ts`
 *
 * It therefore imports nothing at all, and must keep doing so.
 *
 * DENY BY DEFAULT is the entire point. Everything not named below is a
 * 404 that never reaches the app, so a private route added in future is
 * blocked automatically. Never turn this into a blocklist.
 */

/**
 * Header the public listener injects after stripping any inbound copy,
 * so the app can tell which surface a request arrived on. Client input
 * is never trusted here: the value can only ever *restrict* a caller
 * (see `src/middleware.ts`), never widen access.
 */
export const SURFACE_HEADER = 'x-trickywords-surface'

/** The only value `SURFACE_HEADER` ever carries. */
export const PUBLIC_SURFACE = 'public'

/**
 * Paths a guest may reach, matched exactly after normalisation. A query
 * string is not part of a pathname, so `/play?set=3` matches `/play`.
 *
 * `/play/<profileId>` is deliberately absent: that is the family route
 * for one named child, and an exact match cannot reach it.
 */
const ALLOWED_EXACT: ReadonlySet<string> = new Set([
  '/play',
  '/api/health',
  '/favicon.ico',
  '/_next/image',
  // The Open Graph / Twitter card image. A shared guest link (the whole
  // point of the guest surface) has no link preview without it, so this
  // is an exact path added narrowly rather than a new wildcard prefix.
  '/og-card.png',

  // Brand and icon assets, each named exactly because each is actually
  // requested by the guest page -- not a `/brand/` or `/icons/` prefix,
  // which would also serve the files those folders hold that the guest
  // side never asks for.
  //
  //   favicon.svg          <link rel="icon">, root layout
  //   manifest.webmanifest <link rel="manifest">, root layout
  //   app-icon-180         <link rel="apple-touch-icon">, root layout
  //   app-icon-192/512     the manifest's own icons, so a guest can add
  //                        the game to a tablet's home screen
  //   wordmark-blue.svg    the app name on the guest home screen
  //
  // `/favicon.ico` is above already.
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/app-icon-180.png',
  '/icons/app-icon-192.png',
  '/icons/app-icon-512.png',
  '/brand/wordmark-blue.svg',
])

/**
 * Prefixes a guest may reach. Normalisation strips trailing slashes, so
 * a bare `/audio` can never match `/audio/` — a prefix always requires a
 * non-empty remainder.
 */
const ALLOWED_PREFIXES: readonly string[] = [
  '/_next/static/',
  '/_next/image/',
  '/audio/',
  '/fonts/',
  '/avatars/',
  // The twelve island tiles on the guest map. A prefix rather than
  // twelve exact entries because the guest page loads every one of
  // them, and `public/islands/` holds nothing else -- the trailing
  // slash is what keeps this to that one folder (`/islands-private`
  // would not match, and the non-empty-remainder rule in
  // `isPubliclyAllowed` means a bare `/islands` does not either).
  '/islands/',
  // The companion's five growth stages. It sits on the guest map and on
  // the celebration screen, and a visit may show any stage, so the whole
  // folder is allowed. `public/companion/` holds nothing else, and the
  // trailing slash keeps this prefix to that folder -- `/companion-private`
  // would not match, and the non-empty-remainder rule in
  // `isPubliclyAllowed` means a bare `/companion` does not either.
  //
  // `/stickers/` was here too, for a sticker book that no longer exists:
  // one thing that grows is enough, and it is the companion. The images
  // stay in git and are no longer reachable.
  '/companion/',
]

/*
 * `/game-tiles/` was here, for the eight tiles of a game chooser that no
 * longer exists. Nothing renders them, so nothing may fetch them: an
 * allowlist entry for art the app does not ship is a hole, not a
 * convenience. The files stay in git; they are simply no longer
 * reachable over the public surface.
 */

/** Percent-decode until stable. Refuses rather than guessing. */
function decodeFully(path: string): string | null {
  let current = path
  // Four passes covers single, double and triple encoding with room to
  // spare; anything still encoded after that is refused outright.
  for (let pass = 0; pass < 4; pass += 1) {
    if (!current.includes('%')) return current
    let next: string
    try {
      next = decodeURIComponent(current)
    } catch {
      // Malformed escape (`%zz`, a truncated `%2`). Never route it.
      return null
    }
    if (next === current) return current
    current = next
  }
  return current.includes('%') ? null : current
}

// Control characters, NUL included: they can truncate a path downstream
// and make two components disagree about what was actually requested.
// Written as escapes on purpose: the literal bytes would make git
// classify this file as binary, and the security boundary of the
// public surface is the last file in the repo that should have no
// line-level diff, no grep, and no reviewable history.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

/**
 * Normalise a pathname for matching, or return null if it is something
 * we refuse to reason about at all.
 *
 * Always give this the **parsed** pathname (`new URL(...).pathname`),
 * never a raw request line — matching a raw string is how allowlists
 * get walked past.
 */
export function normalisePublicPath(pathname: string): string | null {
  if (typeof pathname !== 'string' || pathname.length === 0) return null

  const decoded = decodeFully(pathname)
  if (decoded === null) return null

  // A backslash is a path separator to some stacks and is never part of
  // a legitimate path here, so fold it before splitting.
  const slashed = decoded.replace(/\\/g, '/')
  if (!slashed.startsWith('/')) return null

  if (CONTROL_CHARS.test(slashed)) return null

  const out: string[] = []
  for (const segment of slashed.split('/')) {
    // Empty segments collapse `//a` and strip trailing slashes; `.` is a
    // no-op segment.
    if (segment === '' || segment === '.') continue
    // `..` is never resolved, only refused. Resolving it would mean
    // deciding what the caller meant; refusing means they get a 404.
    if (segment === '..') return null
    out.push(segment)
  }

  return `/${out.join('/')}`
}

/**
 * Whether the guest listener may route this pathname to the app.
 *
 * Everything else — `/`, `/parent`, `/api/parent`, `/api/progress`,
 * `/api/profiles`, `/play/1`, and any route that does not exist yet —
 * gets a 404 from the listener itself.
 */
export function isPubliclyAllowed(pathname: string): boolean {
  const path = normalisePublicPath(pathname)
  if (path === null) return false
  if (ALLOWED_EXACT.has(path)) return true
  return ALLOWED_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length,
  )
}

/** The one guest screen, and the target of the root redirect below. */
export const PUBLIC_ENTRY_PATH = '/play'

/** Paths the guest listener answers with a redirect to the entry path. */
const REDIRECT_TO_ENTRY: ReadonlySet<string> = new Set(['/', '/index.html'])

/**
 * The `Location` for a guest request the listener should redirect, or
 * null if it should not redirect at all.
 *
 * `/` is the link a human actually shares, so it must land on the game
 * rather than a 404. **This is deliberately NOT an allowlist entry, and
 * must never become one.** The listener answers and stops: the app never
 * sees a request for `/` on the guest port, so there is no path by which
 * the family profile chooser could be rendered there even if the
 * app-level surface guard were broken. Adding `/` to `ALLOWED_EXACT` and
 * letting the app's own redirect handle it looks like a simplification,
 * but it would make the app guard load-bearing for the worst leak this
 * project has — a child's name on a public URL. Keep the decision here.
 *
 * Takes the raw request target (path plus query) because the query has
 * to survive: `/?set=3` is the shareable per-set link, and dropping the
 * query would quietly break it.
 */
export function publicRedirectLocation(requestTarget: string): string | null {
  if (typeof requestTarget !== 'string' || requestTarget.length === 0) return null

  // A control character anywhere would either be a header-injection
  // attempt or a path two components could read differently. Refuse
  // before it can reach a `Location` header.
  if (CONTROL_CHARS.test(requestTarget)) return null

  // Split the target by hand rather than with `URL`. WHATWG URL parsing
  // treats `%2e` as a dot segment and resolves it, so `new URL` turns
  // `/%2e%2e/` into `/` -- it would decide a traversal attempt was a
  // request for the root. Splitting keeps the raw path, so
  // `normalisePublicPath` gets to refuse it instead of interpreting it.
  const withoutFragment = requestTarget.split('#')[0]
  const query = withoutFragment.indexOf('?')
  const rawPath = query === -1 ? withoutFragment : withoutFragment.slice(0, query)
  const search = query === -1 ? '' : withoutFragment.slice(query)

  const path = normalisePublicPath(rawPath)
  if (path === null || !REDIRECT_TO_ENTRY.has(path)) return null
  return `${PUBLIC_ENTRY_PATH}${search}`
}

/** Whether an inbound `SURFACE_HEADER` value marks a request as public. */
export function isPublicSurfaceHeader(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === PUBLIC_SURFACE
}
