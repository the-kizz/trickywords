import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListenAndFind } from '@/components/games/ListenAndFind'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { supportFor } from '@/lib/engine/support'
import { newProgress } from '@/lib/engine/ladder'
import type { Round } from '@/lib/engine/session'
import { playOutReveal, withRevealTimers } from './reveal'
import { answered } from './celebration'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!
const go = ALL.find((w) => w.text === 'go')!

const round = (o: Partial<Round> = {}): Round => ({
  word: said, distractors: [go],
  support: supportFor(newProgress('said')), box: 0, isFinal: false, ...o,
})

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * Render, then play out the reveal: at the errorless support level the
 * round opens on the written word alone and the choices arrive only once
 * it has been said and has faded. Every test below that taps a choice
 * is testing what happens *after* that, so it goes through here.
 */
function asking(props: Parameters<typeof ListenAndFind>[0]) {
  const result = render(<ListenAndFind {...props} />)
  playOutReveal()
  return result
}

describe('ListenAndFind', () => {
  it('shows one button per choice', () => {
    asking({ round: round(), onAnswer: () => {}, onMiss: () => {} })
    expect(screen.getByRole('button', { name: 'said' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'go' })).toBeInTheDocument()
  })

  /**
   * The bug this guards: the next word appeared on screen while "Well
   * done!" was still being said. The praise is spoken the moment the
   * child answers, and the round used to hand over on the same tick, so
   * `onAnswer` -- which mounts the next round -- must not have fired yet.
   */
  it('holds the round open until the praise has finished', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    expect(onAnswer).not.toHaveBeenCalled()
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('reports a correct answer as unprompted when no hint was used', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  // The first listen is free: tapping the big speaker to find out what
  // to do is what the UI invites, and a pre-reader has no other way in.
  it('still reports unprompted after a single request to hear the word', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, false)
  })

  it('reports as prompted once the child asks to hear the word a second time', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: /hear/i }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('does not end the round on a miss — the child gets another go', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'said' })).toBeEnabled()
  })

  it('treats a later correct answer as prompted once a miss has happened', async () => {
    const onAnswer = vi.fn()
    asking({ round: round(), onAnswer, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    await userEvent.click(screen.getByRole('button', { name: 'said' }))
    await answered(onAnswer)
    expect(onAnswer).toHaveBeenCalledWith(true, true)
  })

  it('never shows failure language', async () => {
    asking({ round: round(), onAnswer: () => {}, onMiss: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    const body = document.body.textContent!.toLowerCase()
    for (const banned of ['wrong', 'incorrect', 'try harder']) {
      expect(body).not.toContain(banned)
    }
  })

  it('shows the word up front at the errorless support level', () => {
    render(<ListenAndFind round={round()} onAnswer={() => {}} onMiss={() => {}} />)
    expect(screen.getByTestId('prompt-word')).toBeInTheDocument()
  })

  it('hides the up-front word once support has faded', () => {
    const faded = round({ support: supportFor({ ...newProgress('said'), box: 3 }) })
    render(<ListenAndFind round={faded} onAnswer={() => {}} onMiss={() => {}} />)
    expect(screen.queryByTestId('prompt-word')).toBeNull()
  })
})
