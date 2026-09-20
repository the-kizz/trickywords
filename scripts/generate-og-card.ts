/**
 * Generates `public/og-card.png`, the 1200×630 Open Graph / Twitter card
 * image used when the app's link is pasted into WhatsApp, iMessage or
 * Slack.
 *
 * This is a **design-time script only**. It is never imported or run by
 * the app at runtime -- the app serves the committed PNG as a plain
 * static file, with no image generation and no extra runtime
 * dependency. It exists so the card can be regenerated deterministically
 * if the palette or wording ever changes, rather than hand-edited in an
 * image tool.
 *
 * Method: render a plain HTML page at exactly 1200×630 using the same
 * self-hosted Andika font and design tokens as the app itself (see
 * `src/app/globals.css`), then screenshot it with Playwright -- already
 * a dev dependency, and the simplest reliable way to get pixel-accurate
 * web typography into a static image without a headless-browser runtime
 * dependency in the app itself.
 *
 * The one detail unique to this subject: the word "said" with the heart
 * mark over its tricky part ("ai"), reusing the exact heart glyph and
 * placement logic from `src/components/clay/WordTile.tsx` so the mark
 * matches what a child actually sees in the app. No child's name, no
 * third-party logo or mascot -- original shapes only, built from the
 * app's own design tokens.
 *
 * Run with: npx tsx scripts/generate-og-card.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const WIDTH = 1200
const HEIGHT = 630

// Design tokens, copied from src/app/globals.css -- kept as plain
// literals here rather than imported, since this script renders a
// standalone HTML string with no build step of its own.
const COLOR_PRIMARY = '#2563EB'
const COLOR_PLAY = '#F59E0B'
const COLOR_FUN = '#EC4899'
const COLOR_BACKGROUND = '#EFF6FF'
const COLOR_FOREGROUND = '#0F172A'

// Same heart path as WordTile.tsx, so the mark on this card is the same
// shape a child sees in the app, not a lookalike drawn separately.
/*
 * The card no longer marks a grapheme.
 *
 * It used to draw a heart over the `ai` of "said", reusing the app's own
 * mark so the card matched what a child saw. The app does not draw that
 * mark any more -- naming the tricky part inside a word is not the method
 * this child's programme teaches, see `src/lib/teaching.ts` -- so a card
 * that still showed one would advertise a lesson the app does not give.
 * The heart stays where it belongs, in the wordmark.
 */

const repoRoot = join(import.meta.dirname, '..')

/** Inline the two Andika weights as base64 data URIs, so the rendered
 * page needs no server and no network -- Playwright loads it from a
 * `file://` URL. */
function fontDataUri(relativePath: string): string {
  const bytes = readFileSync(join(repoRoot, 'public', relativePath))
  return `data:font/woff2;base64,${bytes.toString('base64')}`
}

function buildHtml(): string {
  const andikaRegular = fontDataUri('fonts/Andika-Regular.woff2')
  const andikaBold = fontDataUri('fonts/Andika-Bold.woff2')
  const baloo2Bold = fontDataUri('fonts/Baloo2-Bold.woff2')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Andika';
    src: url('${andikaRegular}') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Andika';
    src: url('${andikaBold}') format('woff2');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Baloo 2';
    src: url('${baloo2Bold}') format('woff2');
    font-weight: 700;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background: ${COLOR_BACKGROUND};
    font-family: 'Andika', system-ui, sans-serif;
    position: relative;
    overflow: hidden;
  }

  /* Soft claymorphism blobs in the background, built from the app's
     own accent tokens -- no photography, no stock art. */
  .blob {
    position: absolute;
    border-radius: 50%;
    opacity: 0.16;
  }
  .blob-1 { width: 520px; height: 520px; background: ${COLOR_PRIMARY}; top: -180px; left: -140px; }
  .blob-2 { width: 380px; height: 380px; background: ${COLOR_PLAY}; bottom: -160px; right: -100px; }
  .blob-3 { width: 260px; height: 260px; background: ${COLOR_FUN}; bottom: 40px; left: 760px; }

  .content {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
  }

  .title {
    font-family: 'Baloo 2', system-ui, sans-serif;
    font-weight: 700;
    font-size: 88px;
    color: ${COLOR_PRIMARY};
    letter-spacing: 0.5px;
  }

  .card {
    background: #FFFFFF;
    border-radius: 40px;
    padding: 48px 96px;
    box-shadow: 0 16px 0 rgba(15, 23, 42, 0.12), inset 0 -8px 16px rgba(15, 23, 42, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .word {
    font-family: 'Andika', system-ui, sans-serif;
    font-weight: 700;
    font-size: 220px;
    color: ${COLOR_FOREGROUND};
    display: inline-flex;
    line-height: 1;
  }

  .grapheme {
    position: relative;
    display: inline-block;
  }

  .heart {
    position: absolute;
    top: -0.5em;
    left: 50%;
    transform: translateX(-50%);
    width: 0.85em;
    height: 0.85em;
    fill: ${COLOR_FUN};
  }

  .tagline {
    font-size: 34px;
    color: ${COLOR_FOREGROUND};
    opacity: 0.75;
  }
</style>
</head>
<body>
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>
  <div class="content">
    <div class="title">Tricky Words</div>
    <div class="card">
      <div class="word">
        <span class="grapheme">said</span>
      </div>
    </div>
    <div class="tagline">Sight words for five- to seven-year-olds</div>
  </div>
</body>
</html>`
}

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    await page.setContent(buildHtml(), { waitUntil: 'networkidle' })
    // Fonts are inlined as data URIs, but wait for them to report ready
    // before the screenshot so the first paint isn't a fallback face.
    await page.evaluate(() => document.fonts.ready)

    const outPath = join(repoRoot, 'public', 'og-card.png')
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
    console.log(`wrote ${outPath}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
