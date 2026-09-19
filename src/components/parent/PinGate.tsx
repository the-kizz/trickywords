'use client'
import { useState } from 'react'
import { LockIcon, WifiHighIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'

interface Props {
  /** Whether a PIN has ever been set on this install. */
  pinIsSet: boolean
  onUnlocked: () => void
}

const NETWORK_LINE =
  'This PIN keeps little hands out of the settings. It is not a password -- keep Tricky Words on your home network.'

/**
 * The PIN screen that stands in front of the whole parent area.
 *
 * First run: no PIN exists yet, so this collects one (twice, to catch a
 * typo) instead of asking for one that cannot exist. Every later visit:
 * a plain 4-8 digit entry, verified server-side against the stored hash.
 *
 * Deliberately not styled or worded as "security" -- see the network
 * line below, which is the actual boundary.
 */
export function PinGate({ pinIsSet, onUnlocked }: Props) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFirstRun(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,8}$/.test(pin)) {
      setError('Choose a PIN of 4 to 8 digits.')
      return
    }
    if (pin !== confirmPin) {
      setError("Those two PINs don't match.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-pin', pin }),
      })
      if (!res.ok) {
        setError('Could not save that PIN. Try again.')
        return
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-pin', pin }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
      if (data?.ok) {
        onUnlocked()
      } else {
        setError('That PIN is not right.')
        setPin('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-2 max-w-sm text-center">
        <LockIcon aria-hidden="true" weight="bold" className="w-10 h-10 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Parent area</h1>
      </div>

      <form
        onSubmit={pinIsSet ? handleVerify : handleFirstRun}
        className="flex flex-col items-center gap-4 w-full max-w-xs"
      >
        <label className="flex flex-col gap-1 w-full">
          <span className="text-sm font-semibold text-muted-foreground">
            {pinIsSet ? 'Enter PIN' : 'Choose a PIN (4-8 digits)'}
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ minHeight: MIN_TARGET_PX }}
            className="rounded-clay border-2 border-border bg-card px-4 text-xl tracking-widest text-center
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
          />
        </label>

        {!pinIsSet && (
          <label className="flex flex-col gap-1 w-full">
            <span className="text-sm font-semibold text-muted-foreground">Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              style={{ minHeight: MIN_TARGET_PX }}
              className="rounded-clay border-2 border-border bg-card px-4 text-xl tracking-widest text-center
                focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || pin.length < 4}
          style={{ minHeight: MIN_TARGET_PX }}
          className="w-full rounded-clay bg-primary text-on-primary font-bold text-lg cursor-pointer
            disabled:opacity-40 disabled:cursor-not-allowed
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          {pinIsSet ? 'Unlock' : 'Set PIN'}
        </button>
      </form>

      <div className="flex items-start gap-2 max-w-sm text-sm text-muted-foreground leading-normal">
        <WifiHighIcon aria-hidden="true" weight="bold" className="w-5 h-5 shrink-0 mt-0.5" />
        <p>{NETWORK_LINE}</p>
      </div>
    </main>
  )
}
