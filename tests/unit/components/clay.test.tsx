import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClayButton } from '@/components/clay/Button'
import { WordTile } from '@/components/clay/WordTile'
import { MIN_TARGET_PX } from '@/lib/constants'
import { DEFAULT_SETS } from '@/lib/words/default-sets'
import { HEART_MARKS_ENABLED } from '@/lib/teaching'

const ALL = DEFAULT_SETS.flatMap((s) => s.words)
const said = ALL.find((w) => w.text === 'said')!  // heart, tricky at index 1
const go = ALL.find((w) => w.text === 'go')!      // decodable, no hearts

describe('ClayButton', () => {
  it('meets the child touch target floor', () => {
    render(<ClayButton label="Play" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Play' })).toHaveStyle({
      minWidth: `${MIN_TARGET_PX}px`,
      minHeight: `${MIN_TARGET_PX}px`,
    })
  })

  it('calls onPress when tapped', async () => {
    const onPress = vi.fn()
    render(<ClayButton label="Play" onPress={onPress} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('exposes an accessible name even when it shows only an icon', () => {
    render(<ClayButton ariaLabel="Hear the word" icon onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hear the word' })).toBeInTheDocument()
  })

  it('is never draggable', () => {
    const { container } = render(<ClayButton label="Play" onPress={() => {}} />)
    expect(container.querySelector('button')!.getAttribute('draggable')).not.toBe('true')
  })
})

describe('WordTile', () => {
  it('renders the whole word', () => {
    render(<WordTile word={said} />)
    expect(screen.getByTestId('word-text')).toHaveTextContent('said')
  })

  it.runIf(HEART_MARKS_ENABLED)('marks the tricky grapheme with a heart on a heart word', () => {
    render(<WordTile word={said} showTricky />)
    expect(screen.getByTestId('tricky-1')).toBeInTheDocument()
  })

  it('marks nothing on a decodable word, because it is not tricky', () => {
    render(<WordTile word={go} showTricky />)
    expect(screen.queryByTestId(/^tricky-/)).toBeNull()
  })

  it('shows no hearts unless asked', () => {
    render(<WordTile word={said} />)
    expect(screen.queryByTestId(/^tricky-/)).toBeNull()
  })

  it('renders the word in Andika, the literacy typeface', () => {
    render(<WordTile word={said} />)
    expect(screen.getByTestId('word-text')).toHaveClass('font-word')
  })
})
