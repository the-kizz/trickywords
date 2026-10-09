import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from '@/components/SessionRunner'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { newProgress } from '@/lib/engine/ladder'
import { COMPANION_THRESHOLDS } from '@/lib/rewards'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { Word } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'
import { playOutClosing, playOutReveal, withRevealTimers } from '../games/reveal'
import { answerRound } from './answer'

const WORDS = DEFAULT_SETS[0].words

beforeEach(() => {
  withRevealTimers()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { vi.useRealTimers() })

/**
 * The session's last act: one word to read out loud, then a tick. Both
 * of its controls are successes; this takes the tick, which is what
 * ends the session. Harmless when the round is not offered.
 */
async function sayItAndFinish() {
  const tick = screen.queryByRole('button', { name: 'I said that' })
  if (tick) await userEvent.click(tick)
}

const props = () => ({
  words: WORDS,
  initialProgress: new Map(WORDS.map((w) => [w.id, newProgress(w.id)])),
  onProgressChange: vi.fn(),
  onComplete: vi.fn(),
})

/**
 * Everything but `keep` parked well into the future, so the session's
 * queue is exactly one word.
 *
 * A session asks for what is *due*, oldest first (see `sessionQueue`),
 * so "the strongest word" is no longer a way to name the only round --
 * it is the least likely word to be asked for. Holding the rest back is.
 */
function onlyDue(start: Map<string, WordProgress>, keep: string) {
  for (const [id, p] of start) {
    if (id !== keep) start.set(id, { ...p, dueInSessions: 8 })
  }
  return start
}

describe('SessionRunner', () => {
  it('starts on the first round', () => {
    render(<SessionRunner {...props()} />)
    expect(screen.getByTestId('round-counter')).toHaveTextContent('1')
  })

  it('never shows a score or a correct/incorrect tally', () => {
    render(<SessionRunner {...props()} />)
    const body = document.body.textContent!.toLowerCase()
    expect(body).not.toMatch(/score|points|\d+\s*\/\s*\d+\s*correct/)
  })

  it('reports progress upward after an answer', async () => {
    const p = props()
    // Seed 'my' as the strongest word so it is the single (final)
    // round, and as struggling so the round is a Find it -- a
    // struggling word is never asked to build, which makes the button
    // to click deterministic.
    const start = new Map(p.initialProgress)
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known', struggling: true })
    onlyDue(start, 'my')
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await waitFor(() => expect(p.onProgressChange).toHaveBeenCalled())
  })

  it('calls onComplete once the last round resolves', async () => {
    const p = props()
    const start = new Map(p.initialProgress)
    // `struggling` keeps the round a Find it -- see above.
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known', struggling: true })
    onlyDue(start, 'my')
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await sayItAndFinish()
    await waitFor(() => expect(p.onComplete).toHaveBeenCalled())
  })

  it('decrements the due countdown once per session, not per round', async () => {
    const p = props()
    const start = new Map(p.initialProgress)
    // 'my' is strongest, so it is the only round played. 'the' is never
    // answered, so its countdown can only move via the end-of-session
    // decrement -- which is exactly what this test is checking.
    start.set('my', { ...start.get('my')!, box: 5, stage: 'known', struggling: true })
    onlyDue(start, 'my')
    start.set('the', { ...start.get('the')!, box: 3, dueInSessions: 4 })
    render(<SessionRunner {...p} initialProgress={start} sessionLength={1} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await sayItAndFinish()
    await waitFor(() => expect(p.onComplete).toHaveBeenCalled())
    const final = p.onComplete.mock.calls[0][0] as Map<string, ReturnType<typeof newProgress>>
    expect(final.get('the')!.dueInSessions).toBe(3)
  })

  /**
   * Mirrors what `FamilyPlay` and `GuestHome` actually do: they own the
   * progress map and hand `SessionRunner` a fresh one on every answer.
   * A runner that recomputed its "before" sticker count from the prop
   * would see the newly-learned word already in it, and would never
   * announce the sticker the child just earned.
   */
  function Harness({ words, start }: { words: Word[]; start: Map<string, WordProgress> }) {
    const [progress, setProgress] = useState(start)
    return (
      <SessionRunner
        words={words}
        initialProgress={progress}
        onProgressChange={(p) =>
          setProgress((prev) => {
            const next = new Map(prev)
            next.set(p.wordId, p)
            return next
          })
        }
        onComplete={(all) => setProgress(all)}
        sessionLength={1}
      />
    )
  }

  /**
   * The companion is the one reward now. It grows from the stored
   * high-water mark of known words, so a session that crosses a
   * threshold shows the bigger friend on its own celebration -- and a
   * session in which a word slipped back never shows a smaller one.
   */
  it('shows the companion on the celebration, grown from what they know', async () => {
    const my = WORDS.find((w) => w.text === 'my')!
    const start = new Map<string, WordProgress>()
    for (const w of WORDS.filter((w) => w.id !== my.id).slice(0, COMPANION_THRESHOLDS[1] - 1)) {
      start.set(w.id, { ...newProgress(w.id), box: 5, stage: 'known' })
    }
    // `struggling` keeps the round a Find it -- a word that keeps
    // slipping is never asked to build (see `roundTypeFor`) -- whose
    // choice button carries the word as its accessible name.
    start.set(my.id, {
      ...newProgress(my.id), box: 4, stage: 'reviewing', struggling: true,
    })

    render(<Harness words={[my]} start={start} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await sayItAndFinish()

    await waitFor(() => expect(screen.getByTestId('celebration')).toBeInTheDocument())
    expect(screen.getByTestId('celebration').querySelector('img')).toBeTruthy()
  })

  /** And there is nothing else on it: no stickers, no score, no tally. */
  it('offers no second reward beside the companion', async () => {
    const my = WORDS.find((w) => w.text === 'my')!
    const start = new Map<string, WordProgress>([
      [my.id, { ...newProgress(my.id), box: 1, stage: 'learning', struggling: true }],
    ])

    render(<Harness words={[my]} start={start} />)
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await sayItAndFinish()

    await waitFor(() => expect(screen.getByTestId('celebration')).toBeInTheDocument())
    expect(screen.queryByText(/sticker/i)).toBeNull()
    expect(screen.queryByTestId(/^sticker-slot-/)).toBeNull()
  })
})

/**
 * The way out of a running session (review §3's other half).
 *
 * A child who taps into the wrong set, or who simply wants to stop, had
 * no exit on the family side at all: the session ended when it ended.
 * The control that fixes it has to be quiet, far from the answers, and
 * non-destructive -- everything the guest side's "Start again" was not.
 */
describe('leaving a running session', () => {
  /**
 * The session's last act: one word to read out loud, then a tick. Both
 * of its controls are successes; this takes the tick, which is what
 * ends the session. Harmless when the round is not offered.
 */
async function sayItAndFinish() {
  const tick = screen.queryByRole('button', { name: 'I said that' })
  if (tick) await userEvent.click(tick)
}

const props = () => ({
    words: WORDS,
    initialProgress: new Map(WORDS.map((w) => [w.id, newProgress(w.id)])),
    onProgressChange: vi.fn(),
    onComplete: vi.fn(),
  })

  /** The word the round is asking for, from the runner's own attribute. */
  const target = () =>
    document.querySelector('[data-target-word]')!.getAttribute('data-target-word')!

  it('is not rendered at all for a caller with nowhere to go back to', () => {
    render(<SessionRunner {...props()} />)
    expect(screen.queryByTestId('session-back')).toBeNull()
  })

  it('offers a Back control, labelled and big enough for a small finger', () => {
    render(<SessionRunner {...props()} onLeave={vi.fn()} />)
    const back = screen.getByTestId('session-back')
    // A visible label as well as an accessible name -- never an icon alone.
    expect(back).toHaveTextContent('Back')
    expect(back).toHaveAccessibleName('Back to the map')
    expect(back.style.minHeight).toBe(`${MIN_TARGET_PX}px`)
    expect(back.style.minWidth).toBe(`${MIN_TARGET_PX}px`)
  })

  /**
   * Above the pips, before the game: every game's instruction, speaker
   * and answers come after it in the document. The pixel gap is measured
   * in a real browser (`tests/e2e/layout.spec.ts`); what is asserted
   * here is the ordering that produces it, which is the part a
   * refactor could quietly undo.
   */
  it('sits above the round, not among the answers', () => {
    render(<SessionRunner {...props()} onLeave={vi.fn()} />)
    playOutReveal()
    const back = screen.getByTestId('session-back')
    const pips = screen.getByTestId('round-counter')
    const choices = screen.getByTestId('choices')
    expect(back.compareDocumentPosition(pips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(back.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // And it is not inside the answers.
    expect(choices.contains(back)).toBe(false)
  })

  it('speaks "Go back" and leaves when it is tapped', async () => {
    const played: string[] = []
    window.HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
      played.push(this.src)
      return Promise.resolve()
    })
    const onLeave = vi.fn()
    render(<SessionRunner {...props()} onLeave={onLeave} />)
    await userEvent.click(screen.getByTestId('session-back'))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(played.some((src) => src.endsWith('/audio/phrases/goBack.ogg'))).toBe(true)
  })

  /**
   * Non-destructive: the answers already given stand. Progress is
   * reported per answer, so leaving abandons the rounds not yet played
   * and nothing else -- in particular it does not complete the session,
   * which is what would run the end-of-session `decrementDue` pass.
   */
  it('keeps the progress a child earned before they left', async () => {
    const p = props()
    render(
      <SessionRunner {...p} onLeave={vi.fn()} sessionLength={3} />,
    )
    playOutReveal()
    const word = target()
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${word}$`, 'i') }))
    playOutClosing()
    await waitFor(() => expect(p.onProgressChange).toHaveBeenCalled())

    const recorded = p.onProgressChange.mock.calls.at(-1)![0] as WordProgress
    expect(recorded.wordId).toBe(word)
    expect(recorded.box).toBeGreaterThan(0)

    await userEvent.click(screen.getByTestId('session-back'))
    // Nothing further was reported, and nothing was rolled back.
    expect(p.onComplete).not.toHaveBeenCalled()
    expect(p.onProgressChange.mock.calls.at(-1)![0]).toEqual(recorded)
  })

  /** The celebration has its own continue path; a second exit is clutter. */
  it('is gone from the celebration screen', async () => {
    const p = props()
    const my = WORDS.find((w) => w.text === 'my')!
    const start = new Map(p.initialProgress)
    // `struggling` keeps the round a Find it -- see above.
    start.set(my.id, { ...start.get(my.id)!, box: 5, stage: 'known', struggling: true })
    onlyDue(start, my.id)
    render(
      <SessionRunner {...p} initialProgress={start} onLeave={vi.fn()} sessionLength={1} />,
    )
    expect(screen.getByTestId('session-back')).toBeInTheDocument()
    playOutReveal()
    await userEvent.click(screen.getByRole('button', { name: 'my' }))
    playOutClosing()
    await sayItAndFinish()
    await waitFor(() => expect(screen.getByTestId('celebration')).toBeInTheDocument())
    expect(screen.queryByTestId('session-back')).toBeNull()
  })

  it('says nothing that reads as failing, scoring or losing', () => {
    render(<SessionRunner {...props()} onLeave={vi.fn()} />)
    const text = screen.getByTestId('session-back').textContent!.toLowerCase()
    for (const banned of ['wrong', 'quit', 'give up', 'stop', 'score', 'lose']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})
