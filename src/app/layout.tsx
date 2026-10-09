import type { Metadata } from "next";
import "./globals.css";
import { resolveSiteUrl } from "@/lib/site-url";
import { OG_IMAGE_PATH } from "@/lib/public-surface.mts";
import { AudioDebug } from "@/components/debug/AudioDebug";

const TITLE = "Tricky Words";
// No description, on purpose. A shared link's preview is the card, the
// title and the description, and the operator wants the card to speak
// for itself: "Get tricky" and the kickflip, no line of copy under it.
// WhatsApp, iMessage and the rest show `og:description` (falling back to
// `description`) as a grey line beneath the title -- it read "A gentle,
// self-hosted sight words app...", which is how the project describes
// itself on GitHub, not how a parent describes it to the class chat.
// Leaving all three out leaves nothing to show.
// Describes the card at `public/og/og-card-1200x630.png`. Kept in step
// with the image: the wording has been wrong three times now -- once
// describing a placeholder, once promising seven games, once still
// describing the card before this one -- and it is the first thing
// anyone sees when the link is shared.
//
// "Get tricky" is the tagline mark, used on outward-facing surfaces
// only. The app's name is still Tricky Words, which is why the card
// carries both and why `TITLE` is unchanged.
const OG_IMAGE_ALT =
  'Get tricky — Tricky Words. A round blue character rides a skateboard '
  + 'mid-kickflip beside the words.';

const siteUrl = resolveSiteUrl(process.env);

/**
 * The Open Graph / Twitter image URL.
 *
 * Deliberately NOT put through `openGraph.images` / `twitter.images`:
 * Next always resolves those to an absolute URL, and when no
 * `metadataBase` is set it falls back to `http://localhost:${PORT}` --
 * which, in this container, is the loopback app port nothing outside
 * can reach, i.e. exactly the "broken absolute URL" this must avoid.
 * The path (a genuinely relative one, no scheme) is rendered as a plain
 * `<meta>` tag below instead, which React 19 hoists into `<head>` on its
 * own. A relative `og:image` resolves correctly against the actual page
 * URL a scraper already has -- no configuration needed -- and
 * `TRICKYWORDS_SITE_URL`, when set, upgrades it to a real absolute URL
 * for scrapers that need one.
 *
 * A designed asset, not a generated one. There was a script that built
 * this card by screenshotting an HTML page; it was deleted along with
 * the card it made, because leaving it in place meant one `npx tsx` away
 * from silently overwriting the real artwork. The alternate
 * wordmark-only cut sits beside this one and is not referenced.
 *
 * The path itself comes from `public-surface.mts`, where the guest
 * allowlist that has to permit it also lives -- one constant, so the two
 * cannot drift.
 */
const ogImageUrl = siteUrl ? new URL(OG_IMAGE_PATH, siteUrl).toString() : OG_IMAGE_PATH;

export const metadata: Metadata = {
  title: TITLE,
  // Optional: only set when TRICKYWORDS_SITE_URL is a valid http(s) URL.
  // Omitted entirely when unset, rather than guessed at -- the app has
  // no domain by default and must keep working with no internet and no
  // domain configured.
  metadataBase: siteUrl,
  openGraph: {
    title: TITLE,
    siteName: TITLE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
  },
  // Declared here rather than through the `app/icon.*` file convention
  // because the brand set is three files with three different roles:
  // the .ico for browsers that still want one (it carries 16/32/48, and
  // 48 is the size Chrome actually reads), the .svg for everything
  // modern, and the 3D tile for an iOS home screen. All are relative
  // paths under `public/`, so nothing is fetched from off-origin -- the
  // app has to work with no internet at all.
  //
  // `/manifest.webmanifest` is deliberately absent: `src/app/manifest.ts`
  // is a file convention, and Next emits its <link rel="manifest"> tag.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* React hoists meta/link tags rendered anywhere in the tree
            into <head> -- see the comment on `ogImageUrl` above for why
            these are hand-written instead of going through
            `openGraph.images` / `twitter.images`. */}
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={OG_IMAGE_ALT} />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="twitter:image:alt" content={OG_IMAGE_ALT} />
        {children}
        <AudioDebug />
      </body>
    </html>
  );
}
