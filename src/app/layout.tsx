import type { Metadata } from "next";
import "./globals.css";
import { resolveSiteUrl } from "@/lib/site-url";

const TITLE = "Tricky Words";
const DESCRIPTION = "A gentle, self-hosted sight words app for children aged 5-7.";
// Describes the card at `public/og-card.png`. Kept in step with the
// image: the old wording described the placeholder card, which showed
// the word "said" with a heart over its tricky part.
const OG_IMAGE_ALT =
  'Tricky Words — a cheering blue character holding a letter T tile with a pink heart, beside the tagline "Seven games for the tricky words from school."';

const siteUrl = resolveSiteUrl(process.env);

/**
 * The Open Graph / Twitter image URL.
 *
 * Deliberately NOT put through `openGraph.images` / `twitter.images`:
 * Next always resolves those to an absolute URL, and when no
 * `metadataBase` is set it falls back to `http://localhost:${PORT}` --
 * which, in this container, is the loopback app port nothing outside
 * can reach, i.e. exactly the "broken absolute URL" this must avoid.
 * `/og-card.png` (a genuinely relative path, no scheme) is rendered as
 * a plain `<meta>` tag below instead, which React 19 hoists into
 * `<head>` on its own. A relative `og:image` resolves correctly against
 * the actual page URL a scraper already has -- no configuration needed
 * -- and `TRICKYWORDS_SITE_URL`, when set, upgrades it to a real
 * absolute URL for scrapers that need one.
 */
const ogImageUrl = siteUrl ? new URL("/og-card.png", siteUrl).toString() : "/og-card.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Optional: only set when TRICKYWORDS_SITE_URL is a valid http(s) URL.
  // Omitted entirely when unset, rather than guessed at -- the app has
  // no domain by default and must keep working with no internet and no
  // domain configured.
  metadataBase: siteUrl,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: TITLE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
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
      </body>
    </html>
  );
}
