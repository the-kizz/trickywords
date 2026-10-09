import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AudioDebug } from '@/components/debug/AudioDebug'
import { speak, silence, onAudioEvent, type AudioEvent } from '@/lib/audio/player'
import { wordAudioUrl } from '@/lib/audio/manifest'
import { installClipHarness } from './clip-harness'

const WORD = wordAudioUrl('said')

beforeEach(() => { installClipHarness(() => {}) })
afterEach(() => { silence(); window.history.replaceState({}, '', '/play') })

describe('audio diagnostics', () => {
  it('reports each play, and a refusal with its reason', async () => {
    const seen: AudioEvent[] = []
    const off = onAudioEvent((e) => seen.push(e))
    speak(WORD)
    await act(async () => { await Promise.resolve() })
    expect(seen.map((e) => e.kind)).toEqual(expect.arrayContaining(['play', 'playing']))

    window.HTMLMediaElement.prototype.play = vi.fn(() =>
      Promise.reject(Object.assign(new Error('The request is not allowed by the user agent'), { name: 'NotAllowedError' })))
    silence()
    speak(WORD)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const refused = seen.find((e) => e.kind === 'refused')
    expect(refused?.detail).toContain('NotAllowedError')
    off()
  })

  it('renders nothing unless the address asks for it', () => {
    render(<AudioDebug />)
    expect(screen.queryByTestId('audio-debug')).toBeNull()
  })

  it('shows the events on screen when asked for', async () => {
    window.history.replaceState({}, '', '/play?debug=audio')
    render(<AudioDebug />)
    await act(async () => { speak(WORD); await Promise.resolve() })
    expect(screen.getByTestId('audio-debug').textContent).toContain('words/said.ogg')
  })
})
