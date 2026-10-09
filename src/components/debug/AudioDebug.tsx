'use client'
import { useEffect, useState } from 'react'
import { audioState, onAudioEvent, type AudioEvent } from '@/lib/audio/player'

/**
 * On-screen audio diagnostics, for a phone in someone's hand.
 *
 * Shown only when the address carries `?debug=audio`; otherwise this
 * renders nothing and subscribes to nothing. It exists because the one
 * audio bug that has mattered -- iPhones refusing sound that no tap
 * started -- cannot be reproduced by the test browsers, which do not
 * apply iOS's rule. The only instrument is the phone itself, and a
 * screenshot of this panel says what the phone did with each clip:
 * asked to play, refused and why, played, ended, or timed out.
 *
 * Nothing here is sent anywhere. It is text on the screen.
 */
const MAX = 60

export function AudioDebug() {
  const [on, setOn] = useState(false)
  const [events, setEvents] = useState<AudioEvent[]>([])
  const [state, setState] = useState<ReturnType<typeof audioState> | null>(null)

  useEffect(() => {
    if (!/[?&]debug=audio\b/.test(window.location.search)) return
    setOn(true)
    const off = onAudioEvent((e) => {
      setEvents((prev) => [...prev.slice(-(MAX - 1)), e])
      setState(audioState())
    })
    const tick = window.setInterval(() => setState(audioState()), 1000)
    return () => { off(); window.clearInterval(tick) }
  }, [])

  if (!on) return null

  const lines = [
    `ua: ${navigator.userAgent}`,
    `activation: ${(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? 'n/a'}`,
    `visible: ${document.visibilityState}`,
    `state: ${JSON.stringify(state)}`,
    '',
    ...events.map((e) => `${String(e.at).padStart(6)}  ${e.kind.padEnd(8)} ${e.detail}`),
  ]
  const text = lines.join('\n')

  return (
    <div
      data-testid="audio-debug"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999, maxHeight: '45vh',
        overflow: 'auto', background: 'rgba(0,0,0,0.85)', color: '#9f9', font: '11px/1.35 ui-monospace, monospace',
        padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button type="button" onClick={() => setEvents([])} style={{ color: '#fff', border: '1px solid #666', padding: '2px 8px' }}>
          clear
        </button>
        <button
          type="button"
          onClick={() => { void navigator.clipboard?.writeText(text).catch(() => {}) }}
          style={{ color: '#fff', border: '1px solid #666', padding: '2px 8px' }}
        >
          copy
        </button>
        <span style={{ color: '#aaa' }}>audio debug -- {events.length} events</span>
      </div>
      {text}
    </div>
  )
}
