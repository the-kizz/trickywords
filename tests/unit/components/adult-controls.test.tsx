import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The colour tokens this theme actually defines.
 *
 * A Tailwind class naming a token that does not exist does not fail, it
 * falls back -- and the fallback is a near-black that happens to sit on
 * every dark surface at about 3.5:1. Measured on the card run's "They
 * read it" button, `text-primary-foreground` (a name from another
 * project's convention, not this one's) resolved to rgb(15,23,42) on
 * rgb(37,99,235): 3.5:1, under the 4.5:1 WCAG AA asks for normal text,
 * and it looked merely a bit muddy rather than obviously broken.
 *
 * So this reads the stylesheet rather than the rendered page: jsdom does
 * not resolve Tailwind at all, and the fault is in the class name, which
 * is checkable exactly where it is written.
 */
const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

const TOKENS = new Set(
  [...CSS.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
)

/** Every source file that styles something. */
const FILES = [
  'src/components/family/CardRun.tsx',
  'src/components/games/ReadIt.tsx',
  'src/components/map/GrownUpToggle.tsx',
  'src/components/clay/Button.tsx',
]

describe('the colours these controls ask for', () => {
  it('defines on-primary, which is what sits on the primary surface', () => {
    expect(TOKENS.has('on-primary')).toBe(true)
  })

  it.each(FILES)('%s names only tokens this theme defines', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    // `text-`/`bg-`/`border-` classes that look like theme tokens rather
    // than Tailwind's own palette (which always carries a number) or its
    // keywords.
    // Tailwind's own utilities that share these prefixes but name no
    // colour: a border style, a text alignment, a font size, a wrap mode.
    const KEYWORDS = new Set([
      'transparent', 'current', 'inherit', 'white', 'black',
      'center', 'left', 'right', 'justify', 'start', 'end',
      'xs', 'sm', 'base', 'lg', 'xl', 'wrap', 'nowrap', 'balance', 'pretty',
      'solid', 'dashed', 'dotted', 'double', 'none', 'hidden', 'ellipsis',
      'clip', 'wide', 'wider', 'tight', 'tighter', 'normal', 'b', 't', 'l', 'r',
    ])
    const used = [...src.matchAll(/\b(?:text|bg|border|fill)-([a-z][a-z]*(?:-[a-z]+)*)\b(?!-)/g)]
      .map((m) => m[1])
      .filter((name) => !/\d/.test(name) && !KEYWORDS.has(name))
    for (const name of used) {
      expect(TOKENS.has(name), `${file} uses "${name}", which this theme does not define`)
        .toBe(true)
    }
  })
})
