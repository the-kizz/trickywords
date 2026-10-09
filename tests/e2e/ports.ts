/**
 * Ports for the single E2E server, shared by `playwright.config.ts` and
 * the specs that need to reach across surfaces.
 *
 * One server process, two published listeners — the same shape the
 * container runs. The isolation suite proves its claims against the real
 * guest listener from `docker/entrypoint.mjs`, not against a second
 * server booted in a different mode.
 *
 * Everything below 4100 is taken by other local services on the
 * development host, hence the range.
 */

/** Family surface: the unfiltered pass-through. */
export const FAMILY_PORT = 4111

/** Guest surface: the deny-by-default allowlist. */
export const PUBLIC_PORT = 4112

/** Loopback port the Next app itself listens on. Never published. */
export const APP_PORT = 4113

export const familyURL = `http://localhost:${FAMILY_PORT}`
export const publicURL = `http://localhost:${PUBLIC_PORT}`
