'use client'
import { useState } from 'react'
import { PlusIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import { Avatar, AVATAR_IDS, AVATAR_LABELS } from '@/components/avatar/Avatar'

interface Props {
  onCreated: () => void
}

/** Adds a new child profile: a name and an avatar, nothing else. */
export function NewProfileForm({ onCreated }: Props) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_IDS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give this profile a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), avatar }),
      })
      if (!res.ok) {
        setError('Could not create that profile.')
        return
      }
      setName('')
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-card rounded-clay border-4 border-border p-5">
      <h2 className="font-display text-lg font-bold">Add a child</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted-foreground">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minHeight: MIN_TARGET_PX }}
          className="rounded-clay border-2 border-border px-4"
        />
      </label>
      <div role="group" aria-label="Choose an avatar" className="flex flex-wrap gap-2">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={avatar === id}
            aria-label={AVATAR_LABELS[id]}
            onClick={() => setAvatar(id)}
            style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
            className={`flex items-center justify-center rounded-clay border-2 cursor-pointer
              ${avatar === id ? 'border-primary bg-muted' : 'border-border'}
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun`}
          >
            <Avatar avatar={id} size={32} />
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        style={{ minHeight: MIN_TARGET_PX }}
        className="flex items-center justify-center gap-2 rounded-clay bg-play text-on-play font-bold cursor-pointer
          disabled:opacity-40
          focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
      >
        <PlusIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
        Add child
      </button>
    </form>
  )
}
