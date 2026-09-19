import { describe, it, expect } from 'vitest'
import {
  isPubliclyAllowed,
  isPublicSurfaceHeader,
  normalisePublicPath,
  publicRedirectLocation,
  PUBLIC_ENTRY_PATH,
  PUBLIC_SURFACE,
  SURFACE_HEADER,
} from '@/lib/public-surface.mts'

/**
 * This is the security boundary of the public surface: the guest
 * listener routes nothing to the app that `isPubliclyAllowed` rejects.
 * It gets the most thorough tests in the repo for that reason.
 */

describe('isPubliclyAllowed — allowed paths', () => {
  it.each([
    '/play',
    '/api/health',
    '/favicon.ico',
    '/_next/image',
    '/og-card.png',
    '/favicon.svg',
    '/manifest.webmanifest',
    '/icons/app-icon-180.png',
    '/icons/app-icon-192.png',
    '/icons/app-icon-512.png',
    '/brand/wordmark-blue.svg',
  ])('allows the exact path %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(true)
  })

  /**
   * Everything the guest page actually requests, and nothing else in
   * the folders those files live in. The point of naming each one is
   * that `public/icons/` and `public/brand/` both hold files the guest
   * side never asks for, and a prefix would have served them too.
   */
  it('allows the brand and icon files the guest page references, and only those', () => {
    for (const path of [
      '/favicon.svg',
      '/manifest.webmanifest',
      '/icons/app-icon-180.png',
      '/icons/app-icon-192.png',
      '/icons/app-icon-512.png',
      '/brand/wordmark-blue.svg',
    ]) {
      expect(isPubliclyAllowed(path), path).toBe(true)
    }

    for (const path of [
      // In public/icons/ and public/brand/, but never requested by the
      // guest page -- so neither folder became a prefix.
      '/icons/favicon-16.png',
      '/icons/favicon-32.png',
      '/icons/favicon-48.png',
      '/icons/favicon-192.png',
      '/icons/favicon-512.png',
      '/icons/app-icon-1024.png',
      '/brand/wordmark-navy.svg',
      '/brand/wordmark-white.svg',
      // Not prefixes: nothing else under either folder, and no
      // neighbouring path that merely starts the same way.
      '/icons',
      '/icons/',
      '/icons/anything.png',
      '/brand',
      '/brand/anything.svg',
      '/icons/app-icon-192.png/x',
      '/manifest.webmanifest/x',
      '/manifest.json',
      '/favicon.svgx',
      '/favicon.svg/x',
      '/brand/wordmark-blue.svg.map',
    ]) {
      expect(isPubliclyAllowed(path), path).toBe(false)
    }
  })

  it('allows every island tile, under one prefix with a real / boundary', () => {
    for (let setId = 1; setId <= 12; setId += 1) {
      const path = `/islands/island-${String(setId).padStart(2, '0')}-x.webp`
      expect(isPubliclyAllowed(path), path).toBe(true)
    }
    expect(isPubliclyAllowed('/islands/island-01-flag.webp')).toBe(true)
    expect(isPubliclyAllowed('/islands/island-12-castle-tower.webp')).toBe(true)

    // The prefix is `/islands/`, so the boundary is a real slash: a bare
    // `/islands` has no remainder, and a sibling path that merely starts
    // with the same letters is a different path.
    expect(isPubliclyAllowed('/islands')).toBe(false)
    expect(isPubliclyAllowed('/islands/')).toBe(false)
    expect(isPubliclyAllowed('/islands-private/secret.webp')).toBe(false)
    expect(isPubliclyAllowed('/islandsprivate')).toBe(false)

    // And it is still only a prefix of the pathname -- it can no more
    // be walked out of than any other entry here.
    expect(isPubliclyAllowed('/islands/../parent')).toBe(false)
    expect(isPubliclyAllowed('/islands/..%2fparent')).toBe(false)
  })

  it('allows the Open Graph card image, and only that exact path -- not a new wildcard', () => {
    expect(isPubliclyAllowed('/og-card.png')).toBe(true)
    // Confirms this was added as a narrow exact entry, not a prefix:
    // neighbouring and nested paths stay denied.
    expect(isPubliclyAllowed('/og-card2.png')).toBe(false)
    expect(isPubliclyAllowed('/og-card.png/x')).toBe(false)
    expect(isPubliclyAllowed('/og/card.png')).toBe(false)
    expect(isPubliclyAllowed('/parent-og-card.png')).toBe(false)
  })

  it.each([
    '/_next/static/chunks/main-abc123.js',
    '/_next/static/css/app.css',
    '/_next/static/media/andika.woff2',
    '/_next/image/whatever.png',
    '/audio/said.mp3',
    '/audio/phrases/whos-playing.mp3',
    '/fonts/andika-regular.woff2',
    '/avatars/avatar-fox.webp',
  ])('allows the asset path %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(true)
  })

  it('allows /play with any query string, because a query is not part of a pathname', () => {
    // The listener matches on `new URL(...).pathname`, so these all
    // arrive here as plain '/play'.
    expect(isPubliclyAllowed(new URL('http://h/play?set=3').pathname)).toBe(true)
    expect(isPubliclyAllowed(new URL('http://h/play?set=3&x=../parent').pathname)).toBe(true)
  })

  it('allows a trailing slash on an allowed exact path', () => {
    // '/play/' has an empty final segment, so it can never reach
    // '/play/[profileId]'.
    expect(isPubliclyAllowed('/play/')).toBe(true)
  })

  it('allows a collapsed duplicate slash on an allowed path', () => {
    expect(isPubliclyAllowed('//play')).toBe(true)
    expect(isPubliclyAllowed('/audio//said.mp3')).toBe(true)
  })
})

describe('isPubliclyAllowed — the companion and sticker artwork', () => {
  it('allows every companion growth stage the guest arc shows', () => {
    for (let stage = 1; stage <= 5; stage++) {
      expect(isPubliclyAllowed(`/companion/companion-stage-${stage}.webp`)).toBe(true)
    }
  })

  it('allows the cheering pose and its plant layers, which the celebration composites', () => {
    expect(isPubliclyAllowed('/companion/companion-cheering.webp')).toBe(true)
    for (let stage = 2; stage <= 5; stage++) {
      expect(isPubliclyAllowed(`/companion/plant-stage-${stage}.webp`)).toBe(true)
    }
  })

  /**
   * One thing that grows is enough, and it is the companion. The
   * sticker art is still in git; nothing renders it, so nothing may
   * fetch it either.
   */
  it('no longer serves any sticker', () => {
    const names = [
      'seed', 'sprout', 'leaf', 'bud', 'flower', 'butterfly',
      'ladybird', 'snail', 'acorn', 'feather', 'honeybee',
    ]
    names.forEach((name, i) => {
      const path = `/stickers/sticker-${String(i + 1).padStart(2, '0')}-${name}.webp`
      expect(isPubliclyAllowed(path)).toBe(false)
    })
  })

  it('keeps the prefix to its own folder, on a real slash boundary', () => {
    for (const prefix of ['/companion']) {
      expect(isPubliclyAllowed(prefix)).toBe(false)
      expect(isPubliclyAllowed(`${prefix}/`)).toBe(false)
      expect(isPubliclyAllowed(`${prefix}-private/secret.webp`)).toBe(false)
      expect(isPubliclyAllowed(`${prefix}private`)).toBe(false)
      expect(isPubliclyAllowed(`${prefix}.webp`)).toBe(false)
    }
  })

  it('refuses a traversal out of the folder rather than resolving it', () => {
    expect(isPubliclyAllowed('/companion/../parent')).toBe(false)
    expect(isPubliclyAllowed('/companion/..%2fparent')).toBe(false)
    expect(isPubliclyAllowed('/companion/..%2f..%2fapi%2fprofiles')).toBe(false)
  })

  it('still denies the family surface and everything unnamed, unchanged', () => {
    // The companion prefix widens the guest surface by one folder of
    // artwork and nothing else.
    for (const path of [
      '/parent', '/api/profiles', '/api/progress', '/play/1', '/',
      '/companions/x.webp', '/sticker/x.webp', '/og', '/src/lib/rewards.ts',
      '/data/trickywords.db', '/.env',
    ]) {
      expect(isPubliclyAllowed(path)).toBe(false)
    }
  })
})

describe('isPubliclyAllowed — art the app no longer ships', () => {
  /**
   * The chooser is gone, and with it the eight tiles it rendered. The
   * files are still in git; the public surface no longer reaches them,
   * because an allowlist entry for art nothing renders is a hole rather
   * than a convenience.
   */
  const TILES = [
    'tile-01-listen-and-find', 'tile-02-build-the-word', 'tile-03-word-swat',
    'tile-04-memory-pairs', 'tile-05-bingo', 'tile-06-spot-the-word',
    'tile-07-treasure-hunt', 'tile-08-surprise-me',
  ]

  it('no longer serves any game-chooser tile', () => {
    for (const tile of TILES) {
      expect(isPubliclyAllowed(`/game-tiles/${tile}.webp`)).toBe(false)
    }
    expect(isPubliclyAllowed('/game-tiles')).toBe(false)
    expect(isPubliclyAllowed('/game-tiles/')).toBe(false)
    expect(isPubliclyAllowed('/game-tiles-private/secret.webp')).toBe(false)
  })

  /**
   * The session's way out needed no allowlist entry of its own -- it is
   * a phrase clip under the `/audio/` prefix that was already there --
   * and this asserts that is genuinely so, alongside the denials that
   * prefix must keep making.
   */
  it('allows the session Back clip, and widens nothing', () => {
    expect(isPubliclyAllowed('/audio/phrases/goBack.ogg')).toBe(true)
    expect(isPubliclyAllowed('/audio')).toBe(false)
    expect(isPubliclyAllowed('/audiophrases/goBack.ogg')).toBe(false)
    expect(isPubliclyAllowed('/audio/../parent')).toBe(false)
    expect(isPubliclyAllowed('/parent')).toBe(false)
    expect(isPubliclyAllowed('/api/progress')).toBe(false)
  })

  it('still denies the family surface and everything unnamed, unchanged', () => {
    for (const path of [
      '/parent', '/api/parent', '/api/progress', '/api/profiles', '/play/1', '/',
      '/game-tile/x.webp', '/tiles/x.webp', '/src/components/games/index.ts',
      '/data/trickywords.db', '/.env',
    ]) {
      expect(isPubliclyAllowed(path)).toBe(false)
    }
  })
})

describe('isPubliclyAllowed — the family surface', () => {
  it.each([
    '/parent',
    '/parent/',
    '/parent/anything',
    '/api/parent',
    '/api/parent/voice',
    '/api/parent/voice/said',
    '/api/progress',
    '/api/profiles',
  ])('denies the family path %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it('denies /play/<profileId>, which is the family route for a named child', () => {
    expect(isPubliclyAllowed('/play/1')).toBe(false)
    expect(isPubliclyAllowed('/play/1/')).toBe(false)
    expect(isPubliclyAllowed('/play/42/anything')).toBe(false)
  })

  it('denies the family home at the root', () => {
    expect(isPubliclyAllowed('/')).toBe(false)
  })
})

describe('isPubliclyAllowed — deny by default', () => {
  it.each([
    '/robots.txt',
    '/manifest.json',
    '/api',
    '/api/',
    '/api/anything',
    '/_next',
    '/_next/',
    '/_next/server/app/parent/page.js',
    '/_next/static',
    '/audio',
    '/fonts',
    '/avatars',
    '/some-route-nobody-has-written-yet',
    '/.env',
    '/.git/config',
  ])('denies %s, because nothing is allowed unless it is named', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it('is case sensitive, so near-misses of allowed paths are denied', () => {
    expect(isPubliclyAllowed('/Play')).toBe(false)
    expect(isPubliclyAllowed('/PLAY')).toBe(false)
    expect(isPubliclyAllowed('/API/health')).toBe(false)
  })

  it('denies anything that is not an absolute path', () => {
    expect(isPubliclyAllowed('play')).toBe(false)
    expect(isPubliclyAllowed('')).toBe(false)
    expect(isPubliclyAllowed('http://evil.example/play')).toBe(false)
  })
})

describe('isPubliclyAllowed — traversal and encoding attacks', () => {
  it.each([
    '/../parent',
    '/play/../parent',
    '/play/..',
    '/_next/static/../../parent',
    '/audio/../../api/profiles',
    '/..',
    '/../../../../etc/passwd',
  ])('denies plain traversal: %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it.each([
    // A parsed pathname keeps %2f encoded, which is exactly how an
    // allowlist that matched the raw string would be walked past.
    '/..%2fparent',
    '/play%2f..%2fparent',
    '/%2e%2e/parent',
    '/%2E%2E/parent',
    '/play/%2e%2e/parent',
    '/audio/%2e%2e%2f%2e%2e%2fapi/profiles',
  ])('denies percent-encoded traversal: %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it.each([
    // Double and triple encoding: decoded until stable before matching.
    '/%252e%252e/parent',
    '/%252E%252E%252Fparent',
    '/%25252e%25252e/parent',
    '/play/%252e%252e/parent',
  ])('denies multiply-encoded traversal: %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it.each([
    '\\parent',
    '/..\\parent',
    '/play\\..\\parent',
    '/%2e%2e%5cparent',
    '/_next/static/..\\..\\parent',
  ])('denies backslash traversal: %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it.each([
    '/./parent',
    '//parent',
    '///parent',
    '/.//parent',
    '/./api/profiles',
    '//api//profiles',
    '/play/./../parent',
  ])('denies a normalisation dodge that still resolves to a family path: %s', (path) => {
    expect(isPubliclyAllowed(path)).toBe(false)
  })

  it('denies a malformed percent escape rather than guessing at it', () => {
    expect(isPubliclyAllowed('/play%')).toBe(false)
    expect(isPubliclyAllowed('/play%2')).toBe(false)
    expect(isPubliclyAllowed('/play%zz')).toBe(false)
    expect(isPubliclyAllowed('/%')).toBe(false)
  })

  it('denies control characters, including an encoded NUL truncation', () => {
    expect(isPubliclyAllowed('/parent%00.ico')).toBe(false)
    expect(isPubliclyAllowed('/play%00/../parent')).toBe(false)
    expect(isPubliclyAllowed('/play%0a')).toBe(false)
    expect(isPubliclyAllowed('/play%09')).toBe(false)
  })

  it('normalising never turns a denied path into an allowed one', () => {
    // The dodges above must not accidentally *become* '/play'.
    for (const path of ['/./play/../parent', '/play/../play/../parent']) {
      expect(isPubliclyAllowed(path)).toBe(false)
    }
  })
})

describe('normalisePublicPath', () => {
  it('collapses duplicate slashes, drops `.` segments, and strips trailing slashes', () => {
    expect(normalisePublicPath('//play')).toBe('/play')
    expect(normalisePublicPath('/./play/')).toBe('/play')
    expect(normalisePublicPath('/audio//said.mp3')).toBe('/audio/said.mp3')
    expect(normalisePublicPath('/')).toBe('/')
  })

  it('refuses rather than resolving anything containing `..`', () => {
    expect(normalisePublicPath('/a/../b')).toBeNull()
    expect(normalisePublicPath('/a/%2e%2e/b')).toBeNull()
  })

  it('refuses a relative path, a malformed escape and a control character', () => {
    expect(normalisePublicPath('play')).toBeNull()
    expect(normalisePublicPath('/%zz')).toBeNull()
    expect(normalisePublicPath('/play%00')).toBeNull()
  })
})

describe('publicRedirectLocation', () => {
  it('sends the shared root link to the guest entry path', () => {
    expect(publicRedirectLocation('/')).toBe('/play')
    expect(publicRedirectLocation('/index.html')).toBe('/play')
    expect(PUBLIC_ENTRY_PATH).toBe('/play')
  })

  it('preserves the query, because /?set=3 is the shareable per-set link', () => {
    expect(publicRedirectLocation('/?set=3')).toBe('/play?set=3')
    expect(publicRedirectLocation('/index.html?set=12')).toBe('/play?set=12')
    expect(publicRedirectLocation('/?set=3&x=1')).toBe('/play?set=3&x=1')
  })

  it('redirects a normalisation-equivalent root', () => {
    expect(publicRedirectLocation('//')).toBe('/play')
    expect(publicRedirectLocation('/./')).toBe('/play')
  })

  it('does not redirect anything else -- every other path keeps its own answer', () => {
    for (const target of [
      '/play',
      '/play?set=3',
      '/api/health',
      '/parent',
      '/api/profiles',
      '/play/1',
      '/index.htm',
      '/index.html/parent',
      '/favicon.ico',
      '/audio/said.mp3',
      '',
    ]) {
      expect(publicRedirectLocation(target), target).toBeNull()
    }
  })

  it('never redirects a traversal attempt, even one that resolves to the root', () => {
    // WHATWG URL parsing would turn '/%2e%2e/' into '/' and call it a
    // request for the root; this refuses it instead of interpreting it.
    for (const target of [
      '/../parent',
      '/..%2fparent',
      '/%2e%2e/',
      '/%252e%252e/',
      '/..',
      '/%2e%2e',
      '/a/../',
    ]) {
      expect(publicRedirectLocation(target), target).toBeNull()
    }
  })

  it('refuses a control character rather than putting it in a Location header', () => {
    expect(publicRedirectLocation('/%0d%0aX-Injected:%201')).toBeNull()
    expect(publicRedirectLocation('/?set=3\r\nX-Injected: 1')).toBeNull()
  })

  it('drops the fragment, which never reaches a server anyway', () => {
    expect(publicRedirectLocation('/#top')).toBe('/play')
    expect(publicRedirectLocation('/?set=3#top')).toBe('/play?set=3')
  })

  /**
   * The redirect is the listener's own answer, not an allowlist entry.
   * If `/` ever becomes allowed, the app-level guard becomes the only
   * thing standing between a guest and the family profile chooser --
   * see the comment in `public-surface.mts`.
   */
  it('leaves / OUT of the allowlist, so the app never sees it on the guest port', () => {
    expect(isPubliclyAllowed('/')).toBe(false)
    expect(isPubliclyAllowed('/index.html')).toBe(false)
    expect(isPubliclyAllowed('//')).toBe(false)
  })

  it('changes none of the existing denials', () => {
    for (const path of ['/parent', '/api/parent', '/api/progress', '/api/profiles', '/play/1']) {
      expect(isPubliclyAllowed(path), path).toBe(false)
      expect(publicRedirectLocation(path), path).toBeNull()
    }
    // ...and none of the existing allowances.
    for (const path of ['/play', '/api/health', '/favicon.ico', '/audio/said.mp3', '/og-card.png']) {
      expect(isPubliclyAllowed(path), path).toBe(true)
    }
    // Nor does adding the artwork open any part of the family side: the
    // deny-by-default answer for anything not named is unchanged.
    for (const path of [
      '/parent',
      '/api/parent/voice/said',
      '/api/progress',
      '/play/1',
      '/islands',
      '/icons/anything.png',
      '/brand/anything.svg',
      '/public',
      '/anything-at-all',
    ]) {
      expect(isPubliclyAllowed(path), path).toBe(false)
    }
  })
})

describe('isPublicSurfaceHeader', () => {
  it('is the header name the listener injects', () => {
    expect(SURFACE_HEADER).toBe('x-trickywords-surface')
    expect(PUBLIC_SURFACE).toBe('public')
  })

  it('accepts the public marker, ignoring case and surrounding whitespace', () => {
    expect(isPublicSurfaceHeader('public')).toBe(true)
    expect(isPublicSurfaceHeader('  PUBLIC ')).toBe(true)
  })

  it('treats anything else, including absence, as not-public', () => {
    expect(isPublicSurfaceHeader(null)).toBe(false)
    expect(isPublicSurfaceHeader(undefined)).toBe(false)
    expect(isPublicSurfaceHeader('')).toBe(false)
    expect(isPublicSurfaceHeader('family')).toBe(false)
    expect(isPublicSurfaceHeader('publik')).toBe(false)
  })
})
