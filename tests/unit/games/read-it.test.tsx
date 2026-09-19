import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReadIt } from '@/components/games/ReadIt'
import { GrownUpProvider } from '@/components/games/GrownUpContext'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import { ADULT_TARGET_PX, MIN_TARGET_PX } from '@/lib/constants'
import { wordAudioUrl, sentenceAudioUrl } from '@/lib/audio/manifest'
import type { Round } from '@/lib/engine/session'
import { installClipHarness } from '../audio/clip-harness'
import { answered } from './celebration'

/**
 * The round that runs form to sound, and the only one that matches what
 * the school measures: InitiaLit-Foundation's progress monitoring is a
 * list of tricky words read aloud from print, unaided.
 *
 * Who judges changes what it is worth, and that is the whole design --
 * a five-year-old's own account of their reading is not evidence, and an
 * adult watching them read is the school's own assessment.
 */
const said = DEFAULT_SETS.flatMap((s) => s.words).find((w) => w.text === 'said')!

const round = (): Round => ({
  word: said,
  distractors: [],
  support: supportFor({ ...newProgress('said'), box: 3, stage: 'reviewing' }),
  box: 3,
  isFinal: false,
})

let played: string[] = []

beforeEach(() => {
  played = []
  installClipHarness((src) => played.push(src))
})

afterEach(() => { vi.useRealTimers() })

function renderRound(grownUp: boolean, props: Partial<Parameters<typeof ReadIt>[0]> = {}) {
  return render(
    <GrownUpProvider value={grownUp}>
      <ReadIt round={round()} onAnswer={vi.fn()} onMiss={vi.fn()} {...props} />
    </GrownUpProvider>,
  )
}

describe('Read it, on their own', () => {
  it('shows the word and never says it', () => {
    renderRound(false)
    expect(screen.getByTestId('read-it-word')).toHaveTextContent('said')
    expect(played.join(' ')).not.toContain(wordAudioUrl(said.audioId))
  })

  it('lets them check themselves after they have read it', async () => {
    renderRound(false)
    await userEvent.click(screen.getByRole('button', { name: /hear the word/i }))
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
  })

  /**
   * Their own word for it is not evidence, so it resolves the way an
   * answer given after a hint does: the word is practised, the round is
   * a success, and the ladder does not move it up.
   */
  it('records the reading and resolves as prompted, so it cannot promote', async () => {
    const onAnswer = vi.fn()
    const onRead = vi.fn()
    renderRound(false, { onAnswer, onRead })
    await userEvent.click(screen.getByRole('button', { name: 'I said that' }))
    expect(onRead).toHaveBeenCalledWith('child')
    // Held open for the praise, like every other round.
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('offers no adult controls, and keeps theirs big enough for a small finger', () => {
    renderRound(false)
    expect(screen.queryByTestId('read-it-adult')).toBeNull()
    for (const name of ['I said that', 'Let me try again']) {
      expect(screen.getByRole('button', { name }).style.minHeight)
        .toBe(`${MIN_TARGET_PX}px`)
    }
  })

  it('never asks for a microphone', () => {
    const { container } = renderRound(false)
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(document.body.textContent!.toLowerCase()).not.toContain('microphone')
  })
})

describe('Read it, with a grown-up watching', () => {
  it('asks the grown-up, not the child', () => {
    renderRound(true)
    expect(screen.getByTestId('read-it-adult')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I said that' })).toBeNull()
    // Adult-sized, and worded rather than iconic, so a child does not
    // read them as theirs to press.
    expect(screen.getByRole('button', { name: 'They read it' }).style.minHeight)
      .toBe(`${ADULT_TARGET_PX}px`)
  })

  it('still does not say the word while it is asking', () => {
    renderRound(true)
    expect(played.join(' ')).not.toContain(wordAudioUrl(said.audioId))
  })

  /** The school's own assessment, so it counts like any other round. */
  it('resolves unaided when the grown-up says they read it', async () => {
    const onAnswer = vi.fn()
    const onRead = vi.fn()
    renderRound(true, { onAnswer, onRead })

    await userEvent.click(screen.getByRole('button', { name: 'They read it' }))
    expect(onRead).toHaveBeenCalledWith('adult')
    // Not resolved yet -- the sentence comes first.
    expect(onAnswer).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'They said a sentence' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  /** Telling them is a hint, and a hint never promotes -- as everywhere. */
  it('speaks the word and resolves prompted when they had to be told', async () => {
    const onAnswer = vi.fn()
    const onRead = vi.fn()
    const onMiss = vi.fn()
    renderRound(true, { onAnswer, onRead, onMiss })

    await userEvent.click(screen.getByRole('button', { name: 'Tell them the word' }))
    expect(played.join(' ')).toContain(wordAudioUrl(said.audioId))
    expect(onRead).not.toHaveBeenCalled()
    // Recorded as a miss: the adult path must be able to cost a word
    // something, or it can only ever push words up.
    expect(onMiss).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Skip the sentence' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  /**
   * The second half of the school's routine. Nothing scores it and
   * nothing can fail it; skipping it resolves the round just the same.
   */
  it('asks for a sentence, and plays the app\'s own as a model', async () => {
    renderRound(true)
    await userEvent.click(screen.getByRole('button', { name: 'They read it' }))
    expect(screen.getByTestId('read-it-sentence')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'They said a sentence' }))
    // Queued, not spoken over the top: it follows the instruction rather
    // than cutting it off, so it is heard once the queue reaches it --
    // and the round is held open until it has been.
    await waitFor(
      () => expect(played.join(' ')).toContain(sentenceAudioUrl(said.audioId)),
      { timeout: 5000 },
    )
  })

  it('plays no sentence when it is skipped', async () => {
    const onAnswer = vi.fn()
    renderRound(true, { onAnswer })
    await userEvent.click(screen.getByRole('button', { name: 'They read it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip the sentence' }))
    await answered(onAnswer)
    expect(played.join(' ')).not.toContain(sentenceAudioUrl(said.audioId))
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  /**
   * The one round that ended in silence, and the hardest in the app.
   * Every other round says "Well done!"; this went straight to the next
   * word.
   */
  it('praises a reading like every other round', async () => {
    const onAnswer = vi.fn()
    renderRound(true, { onAnswer })
    await userEvent.click(screen.getByRole('button', { name: 'They read it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip the sentence' }))
    await waitFor(() => expect(played.join(' ')).toContain('/audio/phrases/wellDone.ogg'))
  })

  it('says nothing that reads as a failure', async () => {
    renderRound(true)
    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'score', 'failed']) {
      expect(body).not.toContain(banned)
    }
  })
})
