/**
 * Resolution for the `x-forwarded-proto` value the container's two
 * listeners set on every request they forward to the app.
 *
 * `docker/entrypoint.mjs` always strips whatever `x-forwarded-proto` a
 * client sent before forwarding -- that part is not configurable and
 * never should be, since it is client-controlled input. What *is*
 * configurable is the value the listeners themselves stamp in its
 * place: a bare container talking plain HTTP wants `http`, but a
 * TLS-terminating reverse proxy in front of it (Caddy, Nginx Proxy
 * Manager, Cloudflare Tunnel, ...) wants `https`, so that anything the
 * app builds from the external scheme -- an Open Graph image URL, for
 * instance -- is not silently downgraded to `http://` by this hop.
 *
 * `.mts` for the same reason as `public-surface.mts`: `docker/entrypoint.mjs`
 * imports this under plain `node`, which strips type annotations
 * natively, so there is no build step and no runtime dependency. It
 * therefore imports nothing at all.
 */

/** The only two values `resolvePublicProto` ever returns. */
export type ForwardedProto = 'http' | 'https'

/** Safe default: correct for the raw container with no proxy in front. */
export const DEFAULT_PUBLIC_PROTO: ForwardedProto = 'http'

/**
 * Resolve the `TRICKYWORDS_PUBLIC_PROTO` environment value to the proto
 * the listeners should stamp on `x-forwarded-proto`.
 *
 * Trimmed and lower-cased, then only `http` or `https` is accepted --
 * anything else (unset, empty, a typo like `httpss`) falls back to the
 * default rather than being forwarded verbatim, so a misconfigured
 * environment variable can never produce a malformed header value.
 */
export function resolvePublicProto(value: string | null | undefined): ForwardedProto {
  const normalised = String(value ?? '').trim().toLowerCase()
  if (normalised === 'http' || normalised === 'https') return normalised
  return DEFAULT_PUBLIC_PROTO
}
