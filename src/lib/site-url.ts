/**
 * Resolves `TRICKYWORDS_SITE_URL` into a `metadataBase` for
 * `src/app/layout.tsx`.
 *
 * This is genuinely optional. The app has no domain and no internet
 * access by default -- most installs never set it -- and it must keep
 * working completely without it: relative URLs (the Open Graph image
 * included) are still emitted and still resolve correctly for a scraper
 * that already has an absolute page URL, which is how WhatsApp, iMessage
 * and Slack all fetch a link preview. An unset or invalid value is a
 * normal, expected state, not a misconfiguration to warn about.
 */

/** A valid `TRICKYWORDS_SITE_URL`, or `undefined` if unset or unusable. */
export function resolveSiteUrl(env: Record<string, string | undefined>): URL | undefined {
  const raw = env.TRICKYWORDS_SITE_URL?.trim()
  if (!raw) return undefined

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  // Only http/https make sense as a page's own base URL.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined

  return url
}
