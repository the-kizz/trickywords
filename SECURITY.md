# Security

## What this deployment looks like

Tricky Words runs as **one container** serving **two surfaces** from one
Next.js process and one SQLite database:

```
+------------------------ container -------------------------+
|                                                            |
|  family listener :3000  --- pass-through -------+           |
|    always on, LAN/VPN                          |           |
|                                                v           |
|  guest listener :3001   --> deny-by-default --> Next.js app |
|    only if TRICKYWORDS_PUBLIC   allowlist      127.0.0.1    |
|                               + surface header      :3100   |
|                                                  + SQLite   |
+------------------------------------------------------------+
```

The app itself binds `127.0.0.1:3100` inside the container and is never
published. Every request arrives through one of the two listeners.

**The family surface (port 3000)** holds real data about real children:
their names, their per-word reading progress, and optionally recordings
of a parent's own voice reading words aloud. It is designed to run on a
home network or behind a VPN — not on the open internet. There is no
user-account system, no rate limiting on the parent PIN, and no
encryption at rest beyond whatever the host filesystem provides. None of
that is an oversight; it is out of scope because the family surface
assumes the network boundary is doing that job. **Do not expose port
3000 to the internet.**

**The guest surface (port 3001)** is the supported way to put Tricky
Words on a public address. It is not bound at all unless
`TRICKYWORDS_PUBLIC` is set to `1`, `true` or `yes`.

## The boundary, in two layers

### Layer 1 — the allowlist, at the network edge

The guest listener routes only these paths to the app:

| Allowed | |
|---|---|
| `/play` (and any query string) | the one guest screen |
| `/api/health` | liveness |
| `/_next/static/*`, `/_next/image*` | build assets |
| `/audio/*`, `/fonts/*`, `/avatars/*`, `/favicon.ico` | static assets |

Everything else returns 404 **from the listener**, without the request
ever reaching the app: `/parent`, `/api/parent*`, `/api/progress`,
`/api/profiles`, `/play/<childId>`, and any route this project adds in
future.

`/` and `/index.html` are the one exception, and they are still not
allowlisted: the listener answers them itself with a 302 to `/play`
(query string preserved, so `/?set=3` still shares a set) and stops.
The root is the link a human actually pastes to a class, so it has to
land on the game — but keeping it off the allowlist means the app never
receives a request for `/` on this port, and therefore cannot render the
family profile chooser there even if the second layer below were broken.
Adding `/` to the allowlist and letting the app's own redirect handle it
would look like a simplification and would make that guard load-bearing
for the worst leak this project has.

That last clause is the point. This is **deny-by-default**, never a
blocklist: a private route added next year is blocked automatically,
because it was never named as allowed. A blocklist would have to be
remembered and updated, and would fail silently when it wasn't.

Matching is on the **parsed, normalised pathname**, never the raw request
target. Before matching, the path is percent-decoded until stable,
backslashes are folded to slashes, duplicate slashes and `.` segments are
collapsed, and anything still containing `..`, a malformed escape, or a
control character is refused outright rather than resolved. So
`/..%2fparent`, `//parent`, `/./parent`, `/%252e%252e/parent` and
`/play\..\parent` are all 404s.

The decision lives in one pure function,
[`src/lib/public-surface.mts`](src/lib/public-surface.mts), imported by
the container entrypoint, by the app, and by the unit tests — so the
thing that is tested is the thing that runs. It has the most thorough
test coverage in the repo.

### Layer 2 — the app guard

One process now serves both surfaces, so the app cannot tell them apart
from its environment. Instead the guest listener **strips any inbound
`x-trickywords-surface` header** and sets it to `public` itself. The app
([`src/middleware.ts`](src/middleware.ts)) then refuses the whole family
surface for any request carrying it:

| Route | What it holds | Public request gets |
|---|---|---|
| `/` | the profile chooser — **every child's name** | redirect to `/play` |
| `/play/<childId>` | one named child's game — **their name** | 404 |
| `/parent`, `/api/parent*` | the parent area, voice recordings | 404 |
| `/api/progress` | per-word progress writes | 404 |
| `/api/profiles` | the profile list | 404 |

The first two rows are the ones that matter most and were the last to be
covered. `/` and `/play/<childId>` are the only routes in the app that
put a child's *name* in a response, and until recently they were guarded
by `TRICKYWORDS_MODE` alone — which is `family` in a one-container
deployment. For that single worst outcome the allowlist in Layer 1 was
therefore the **only** control, not one of two. It is now genuinely two:
the listener refuses to route them, and the app refuses to serve them.

`/` is redirected rather than 404'd because that refuses it just as
completely — the profile chooser never renders — while keeping the root
a working link, which a whole-container `TRICKYWORDS_MODE=public`
deployment needs.

One honest limitation: because **both** listeners strip the surface
header, no request from outside the container can reach this guard on its
own, so it cannot be exercised end-to-end. It is covered by unit tests
against `middleware()` directly
([`tests/unit/middleware.test.ts`](tests/unit/middleware.test.ts)); the
E2E suite proves Layer 1. That is the price of the header being
untrusted, and it is the right trade — but it means this layer's
correctness rests on unit tests, not on an integration proof.

The header is never trusted as client input. **Both** listeners strip any
inbound copy before forwarding, so a client cannot set it on either
port — on 3001 it is then re-set to `public` by the listener, and on
3000 it is simply gone. And even if it did get through, the only thing
it can do is *restrict*: there is no value a caller can send that
unlocks anything, and no absence of it that reveals more than a
family-mode request already would.

Two independent layers means one bug in one of them is not enough. The
allowlist not routing a path and the app refusing to serve it are
separate mechanisms with separate failure modes.

## Residual risk — read this before exposing port 3001

**The family database is on the same filesystem as the process that
serves guest traffic.** One container, one process, one `/app/data`.

Both layers above are about *routing and request handling*. Neither is a
sandbox. If Next.js — or React, or a transitive dependency — has a
remote-code-execution bug reachable from a request the allowlist *does*
permit (`/play` is a real, server-rendered route), then the code running
after that bug is the same process that can open the SQLite file. It
would reach your children's names, their progress, and any voice
recordings.

Two separate containers would have prevented that, and an earlier
version of this project used them. It was changed to one container
deliberately: the two-container shape was more machinery than a home
server deployment warranted, and it had its own failure mode (an
anonymous writable Docker volume that quietly falsified the public
container's read-only claim). One container with an honest description of
its limits was judged the better trade. **That is the trade, stated
plainly — not a claim of isolation.**

If that risk is not acceptable for your situation, the supported answer
is to run a second container with `TRICKYWORDS_MODE=public` and no data
volume for the public side, and keep the family container off the
internet entirely. Nothing in this design prevents that; it simply isn't
the default any more.

Lesser, related points, for completeness:

- The container's root filesystem is writable (Next writes its own
  caches), so `read_only: true` is not set. The data volume is the only
  mount, and the process runs as an unprivileged user with
  `no-new-privileges`.
- **Supervision covers a dead app, not a hung one.** If the app process
  exits, the entrypoint exits non-zero and the restart policy replaces
  the container. If it is alive but wedged, both listeners keep
  answering — with 502s — and the healthcheck reports `unhealthy`.
  Docker does **not** restart a container for being unhealthy on its
  own: if you want that, you need an external watcher (Autoheal, a
  systemd timer, your orchestrator's own liveness handling) on top of
  `restart: unless-stopped`.
- The guest surface makes no database *writes*, but it is served by a
  process that can.
- Guest progress lives in the browser's `sessionStorage`, per tab, and
  is gone when the tab closes. No cookies are set and no external
  requests are made — both proven in
  [`tests/e2e/public-mode.spec.ts`](tests/e2e/public-mode.spec.ts).

## What the parent PIN is (and is not)

The 4-digit PIN in front of the parent area is a **child gate, not
authentication**. It exists to stop a six-year-old from wandering into
settings and deleting their sibling's profile — nothing more. It is not
rate-limited, not hashed for defence against a determined attacker (it is
hashed to avoid storing it in plaintext, not to resist offline cracking),
and not a substitute for keeping the family surface off the public
internet. If you are relying on the PIN as your security boundary, you
have the wrong boundary — the boundary is the network.

## Reporting a vulnerability

If you find a security issue, please open a GitHub issue on this repo. For
anything you'd rather not post publicly first, mention that in the issue
title (e.g. "security: request private contact") and a maintainer will
follow up with a private channel. There's no bug bounty — this is a small
self-hosted hobby project — but reports are genuinely welcome and will be
credited unless you'd rather stay anonymous.
