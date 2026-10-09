import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SETS } from '@/lib/words/default-sets'

/**
 * Answers whichever round type is on screen, correctly, first time.
 *
 * A session picks the round type itself now (see `roundTypeFor`): a
 * heart word past box 0 is built rather than found, and a test that
 * walks a whole session cannot know in advance which it will meet. Both
 * are answered here the way a child who knows the word would -- Find it
 * by tapping the word, Build the Word by placing its graphemes in order,
 * Read it by saying they read it (or, with a grown-up watching, by the
 * grown-up saying they did and then that they used it in a sentence).
 *
 * Answering *correctly* matters: every wrong tap is a recorded miss, so
 * a test that groped for the right button would bury each word under
 * lapses it never earned and drop it into the struggling support level.
 *
 * The graphemes are worked out rather than read off the round: at each
 * step the next one is the longest available tile that is a prefix of
 * what is left of the word. (True for all 56 default words -- the same
 * rule the end-to-end suite uses.)
 */
export async function answerRound(word: string): Promise<void> {
  // Read it: nothing to tap but the judgement. With a grown-up present
  // the controls are the adult's and there is a sentence step after;
  // on their own it is the tick. Both resolve the round.
  if (screen.queryByTestId('read-it') !== null) {
    const adult = screen.queryByRole('button', { name: 'They read it' })
    if (adult !== null) {
      await userEvent.click(adult)
      await userEvent.click(screen.getByRole('button', { name: 'They said a sentence' }))
      return
    }
    await userEvent.click(screen.getByRole('button', { name: 'I said that' }))
    return
  }
  // Where's the heart?: the buttons are the word's own graphemes, in
  // order, and the answer is any one that is marked tricky. Read off the
  // word list rather than the screen, because the hearts are hidden
  // until the right one is tapped -- which is the round.
  const parts = screen.queryByTestId('heart-parts')
  if (parts !== null) {
    const target = DEFAULT_SETS
      .flatMap((s) => s.words)
      .find((w) => w.id === word.toLowerCase())
    if (!target) throw new Error(`no word "${word}" to find a heart on`)
    const index = target.trickyIndices[0]
    if (index === undefined) throw new Error(`"${word}" has no tricky part`)
    await userEvent.click(parts.querySelectorAll('button')[index] as HTMLButtonElement)
    return
  }
  if (screen.queryByTestId('tiles') !== null) {
    let remaining = word.toLowerCase()
    while (remaining.length > 0) {
      const tiles = screen.getByTestId('tiles').querySelectorAll('button')
      let best: HTMLButtonElement | null = null
      let bestLength = 0
      for (const tile of tiles) {
        const name = (tile.getAttribute('aria-label') ?? '').toLowerCase()
        if (name.length > bestLength && remaining.startsWith(name)) {
          best = tile as HTMLButtonElement
          bestLength = name.length
        }
      }
      if (!best) throw new Error(`no tile starts "${remaining}" for ${word}`)
      await userEvent.click(best)
      remaining = remaining.slice(bestLength)
    }
    return
  }
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${word}$`, 'i') }),
  )
}

/**
 * How many rounds this session is actually running, from the round
 * counter's own screen-reader text ("Round 3 of 7").
 *
 * A session is as long as its queue, which is as long as there is work
 * due -- `sessionLength` is a ceiling, not a promise (see
 * `sessionQueue`). A test that assumed the ceiling would walk off the
 * end of the session and into the say-it screen.
 */
export function totalRounds(): number {
  const text = screen.getByTestId('round-counter').querySelector('.sr-only')!.textContent!
  const match = /Round \d+ of (\d+)/.exec(text)
  if (!match) throw new Error(`not on a round: "${text}"`)
  return Number(match[1])
}

/** The word the round on screen is asking for. */
export function targetWord(): string {
  return document.querySelector('[data-target-word]')!.getAttribute('data-target-word')!
}

/** Whether the rounds are over -- the say-it screen, or the celebration. */
export function roundsFinished(): boolean {
  return screen.queryByTestId('say-it') !== null
    || screen.queryByTestId('celebration') !== null
}
