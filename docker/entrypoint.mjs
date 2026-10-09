#!/usr/bin/env node
/**
 * Tricky Words container entrypoint.
 *
 * One container, one database, one image, one variable:
 *
 *   +------------------------ container -------------------------+
 *   |                                                            |
 *   |  family listener :3000  --- pass-through -------+           |
 *   |    always on, LAN/VPN                          |           |
 *   |                                                v           |
 *   |  guest listener :3001   --> DENY-BY-DEFAULT --> Next.js app |
 *   |    only if TRICKYWORDS_PUBLIC   allowlist      127.0.0.1    |
 *   |                               + surface header      :3100   |
 *   |                                                  + SQLite   |
 *   +------------------------------------------------------------+
 *
 * The Next.js app binds to loopback inside the container and is never
 * published, so nothing outside can reach it directly -- every request
 * arrives through one of the two listeners here.
 *
 * When TRICKYWORDS_PUBLIC is unset, the public port is never bound at
 * all. That is the switch: not a flag the app checks, an absent socket.
 *
 * Plain Node, node: builtins only -- no dependencies, so this runs
 * before and independently of anything the app needs.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

import {
  PUBLIC_SURFACE,
  SURFACE_HEADER,
  isPubliclyAllowed,
  publicRedirectLocation,
} from '../src/lib/public-surface.mts'
import { resolvePublicProto } from '../src/lib/forwarded-proto.mts'

// The image keeps the repo's layout (docker/entrypoint.mjs beside
// src/lib/), so this resolves to /app in the container and to the repo
// root in a local test run.
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))

const APP_HOST = '127.0.0.1'

function port(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(`[trickywords] ${name}=${raw} is not a valid port`)
    process.exit(1)
  }
  return value
}

/** Loopback port the app itself listens on. Never published. */
const APP_PORT = port('TRICKYWORDS_APP_PORT', 3100)
/** Family surface. Always on. LAN or VPN only. */
const FAMILY_PORT = port('TRICKYWORDS_FAMILY_PORT', port('PORT', 3000))
/** Guest surface. Bound only when TRICKYWORDS_PUBLIC is truthy. */
const PUBLIC_PORT = port('TRICKYWORDS_PUBLIC_PORT', 3001)

/**
 * The switch. Anything other than an explicit yes leaves the guest port
 * unbound -- a typo can never accidentally publish the guest side, and
 * the failure is the safe direction.
 */
function isTruthy(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}
const PUBLIC_ENABLED = isTruthy(process.env.TRICKYWORDS_PUBLIC)

/**
 * The scheme this container's listeners claim on `x-forwarded-proto`.
 * `http` is correct for the raw container; set to `https` when a
 * TLS-terminating reverse proxy sits in front, so the app never infers
 * the external scheme from a value this hop would otherwise overwrite.
 */
const PUBLIC_PROTO = resolvePublicProto(process.env.TRICKYWORDS_PUBLIC_PROTO)

/**
 * argv for the app process, as a test hook. Production never sets it:
 * the standalone bundle's own `server.js` is the default. The E2E suite
 * points it at `next dev` so the isolation tests run against the real
 * listeners in this file.
 */
const APP_ARGV = (process.env.TRICKYWORDS_APP_ARGV ?? 'server.js').trim().split(/\s+/)

// ---------------------------------------------------------------------
// The app process
// ---------------------------------------------------------------------

// Next reads HOSTNAME and PORT, so this is what pins it to loopback.
// HOSTNAME must be set explicitly: Docker fills it with the container
// id, which is not an address the app can bind.
const child = spawn(process.execPath, APP_ARGV, {
  cwd: APP_ROOT,
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: APP_HOST, PORT: String(APP_PORT) },
})

let shuttingDown = false

child.on('error', (err) => {
  console.error('[trickywords] could not start the app process:', err.message)
  process.exit(1)
})

// Supervision: if the app dies, the container dies with it, non-zero, so
// the restart policy takes over. A half-dead container that still
// answers on two ports with 502s would be worse than a restart.
child.on('exit', (code, signal) => {
  if (shuttingDown) {
    process.exit(0)
  }
  console.error(
    `[trickywords] app process exited (code=${code} signal=${signal}) -- exiting so the container restarts`,
  )
  process.exit(typeof code === 'number' && code !== 0 ? code : 1)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    shuttingDown = true
    child.kill(signal)
  })
}

// ---------------------------------------------------------------------
// The proxy
// ---------------------------------------------------------------------

// Connection-level headers belong to this hop, not the next one.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * The pathname and query to forward, or null if the target is unusable.
 *
 * Forwarding `req.url` verbatim would hand the app whatever the client
 * wrote on the request line -- an absolute-form target like
 * `GET http://evil.example/play HTTP/1.1` among other things. Upstream
 * is pinned to loopback so there was never an SSRF here, but forwarding
 * the parsed pathname plus query means the app is asked for exactly what
 * the allowlist just decided about, with no parser sitting between the
 * two able to disagree.
 */
function forwardTarget(rawUrl) {
  try {
    const url = new URL(rawUrl ?? '/', 'http://localhost')
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/**
 * Forward a request to the app.
 *
 * `surface` is the value to stamp on the surface header, or null for the
 * family listener. Either way any inbound copy of that header is dropped
 * first: it is an internal marker set by this file, never client input.
 * Node lower-cases inbound header names, so dropping the lower-case key
 * covers every spelling a client could send.
 *
 * The `x-forwarded-*` family is dropped and re-set for the same reason:
 * these describe *this* hop, so a TLS-terminating proxy in front of the
 * container would otherwise have its own `x-forwarded-for`/`-proto`
 * silently overwritten. `x-forwarded-proto` is set from `PUBLIC_PROTO`
 * (`TRICKYWORDS_PUBLIC_PROTO`, default `http`) rather than hardcoded,
 * precisely so that case is configurable instead of always claiming
 * plain HTTP. `host` is left alone, as a proxy should, because the app
 * builds URLs from it.
 */
function forward(req, res, surface) {
  const target = forwardTarget(req.url)
  if (target === null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }

  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name) || name === SURFACE_HEADER) continue
    if (name.startsWith('x-forwarded-')) continue
    headers[name] = value
  }
  if (surface !== null) headers[SURFACE_HEADER] = surface

  const listenerPort = req.socket.localPort
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? ''
  headers['x-forwarded-proto'] = PUBLIC_PROTO
  headers['x-forwarded-host'] = req.headers.host ?? ''
  if (listenerPort !== undefined) headers['x-forwarded-port'] = String(listenerPort)

  const upstream = http.request(
    { host: APP_HOST, port: APP_PORT, method: req.method, path: target, headers },
    (appRes) => {
      // Strip the response's hop-by-hop headers too: they describe the
      // app-to-listener connection, not the listener-to-client one.
      const out = {}
      for (const [name, value] of Object.entries(appRes.headers)) {
        if (HOP_BY_HOP.has(name)) continue
        out[name] = value
      }
      res.writeHead(appRes.statusCode ?? 502, out)
      appRes.pipe(res)
    },
  )

  upstream.on('error', (err) => {
    // The app is starting, restarting, or gone. Never leak the reason.
    console.error(`[trickywords] upstream error for ${req.method} ${req.url}: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('Bad gateway')
  })

  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
}

/**
 * Forward a protocol upgrade (a WebSocket handshake) to the app.
 *
 * The family listener claims to be a transparent pass-through, and an
 * upgrade it silently dropped would make that untrue: the client would
 * fall back to polling an endpoint that only answers over a socket. The
 * hop-by-hop headers are deliberately *kept* here -- `connection` and
 * `upgrade` are what make this an upgrade in the first place.
 *
 * The guest listener has no upgrade handler at all, so Node closes the
 * socket: deny-by-default applies to protocols as well as paths.
 */
function forwardUpgrade(req, clientSocket, head) {
  const target = forwardTarget(req.url)
  if (target === null) {
    clientSocket.destroy()
    return
  }

  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (name === SURFACE_HEADER) continue
    if (name.startsWith('x-forwarded-')) continue
    headers[name] = value
  }
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? ''
  headers['x-forwarded-proto'] = PUBLIC_PROTO
  headers['x-forwarded-host'] = req.headers.host ?? ''

  const upstream = http.request({
    host: APP_HOST,
    port: APP_PORT,
    method: req.method,
    path: target,
    headers,
  })

  const bail = () => {
    clientSocket.destroy()
    upstream.destroy()
  }

  upstream.on('upgrade', (appRes, appSocket, appHead) => {
    const status = `HTTP/1.1 ${appRes.statusCode} ${appRes.statusMessage ?? ''}\r\n`
    let raw = ''
    for (let i = 0; i < appRes.rawHeaders.length; i += 2) {
      raw += `${appRes.rawHeaders[i]}: ${appRes.rawHeaders[i + 1]}\r\n`
    }
    clientSocket.write(`${status}${raw}\r\n`)
    if (appHead?.length) clientSocket.write(appHead)
    appSocket.on('error', bail)
    clientSocket.on('error', bail)
    appSocket.pipe(clientSocket)
    clientSocket.pipe(appSocket)
  })

  // The app declined the upgrade: close rather than leaving a socket
  // half-spoken-to.
  upstream.on('response', bail)
  upstream.on('error', bail)
  clientSocket.on('error', bail)

  if (head?.length) upstream.write(head)
  upstream.end()
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not found')
}

// ---------------------------------------------------------------------
// The two listeners
// ---------------------------------------------------------------------

/** Family surface: everything the app serves, unfiltered. */
const familyServer = http.createServer((req, res) => forward(req, res, null))
familyServer.on('upgrade', forwardUpgrade)

/**
 * Guest surface: deny by default.
 *
 * Matching is on the parsed pathname, normalised, never the raw request
 * target -- see src/lib/public-surface.mts. A path that is not on the
 * allowlist is a 404 from here and never reaches the app at all, so a
 * private route added to the app in future is blocked automatically.
 */
const publicServer = http.createServer((req, res) => {
  const target = req.url ?? '/'

  // `/` is the link a human actually shares, so it lands on the game
  // instead of a 404 -- answered here, by the listener, and NOT
  // forwarded. This is deliberately not an allowlist entry and must
  // never become one: because the app never sees a request for `/` on
  // this port, there is no path by which the family profile chooser
  // could be rendered here even if the app-level surface guard were
  // broken. Allowlisting `/` and letting the app's own redirect handle
  // it would look simpler while making that guard load-bearing for the
  // worst leak in this project -- a child's name on a public URL.
  const redirect = publicRedirectLocation(target)
  if (redirect !== null) {
    res.writeHead(302, { location: redirect, 'cache-control': 'no-store' })
    res.end()
    return
  }

  let pathname = null
  try {
    // The base is a throwaway: only the pathname is used.
    pathname = new URL(target, 'http://localhost').pathname
  } catch {
    pathname = null
  }
  if (pathname === null || !isPubliclyAllowed(pathname)) {
    notFound(res)
    return
  }
  forward(req, res, PUBLIC_SURFACE)
})

function listen(server, listenPort, label) {
  server.on('error', (err) => {
    console.error(`[trickywords] ${label} listener failed on :${listenPort}: ${err.message}`)
    process.exit(1)
  })
  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`[trickywords] ${label} surface on :${listenPort}`)
  })
}

console.log(`[trickywords] app on ${APP_HOST}:${APP_PORT} (loopback only, never published)`)
listen(familyServer, FAMILY_PORT, 'family')

if (PUBLIC_ENABLED) {
  listen(publicServer, PUBLIC_PORT, 'guest')
} else {
  console.log(
    `[trickywords] guest surface off -- :${PUBLIC_PORT} is not bound. Set TRICKYWORDS_PUBLIC=1 to switch it on.`,
  )
}
