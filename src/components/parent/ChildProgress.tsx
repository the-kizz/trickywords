'use client'
import { useState } from 'react'
import { TrashIcon } from '@phosphor-icons/react'
import { ADULT_TARGET_PX, MIN_TARGET_PX } from '@/lib/constants'
import { Avatar } from '@/components/avatar/Avatar'
import { readingSummary, summarizeWordProgress, wordStepLabel } from '@/lib/parent/summary'
import { newProgress } from '@/lib/engine/ladder'
import type { Profile } from '@/lib/db/profiles'
import type { WordSet } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  profile: Profile
  sets: WordSet[]
  progress: Record<string, WordProgress>
  /**
   * The set this child's class is working on, as this parent has said,
   * or null for "not set" -- which is the normal state.
   */
  schoolSetId?: number | null
  onChanged: () => void
}

/**
 * Everything a parent needs to know and do about one child: what they
 * know and what's still slipping (in plain language, not raw ladder
 * fields), where to set their starting point in the school's sequence,
 * and the option to remove them.
 */
export function ChildProgress({
  profile, sets, progress, schoolSetId, onChanged,
}: Props) {
  const [signedOff, setSignedOff] = useState<Set<number>>(new Set())
  const [seeding, setSeeding] = useState(false)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [school, setSchool] = useState<number | null>(schoolSetId ?? null)

  /**
   * Record which set the class is working on.
   *
   * It is a note, not a gate: it marks an island on the map and changes
   * nothing about what a child may tap. "Not set" is a real choice and
   * the normal one -- unset, the map looks exactly as it did before this
   * existed.
   */
  async function pickSchoolSet(setId: number | null) {
    setSchool(setId)
    await fetch('/api/parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-school-set', profileId: profile.id, setId }),
    })
    onChanged()
  }

  function toggleSet(id: number) {
    setSignedOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyStartingPoint() {
    if (signedOff.size === 0) return
    setSeeding(true)
    setSeedMessage(null)
    try {
      const res = await fetch('/api/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seed-starting-point',
          profileId: profile.id,
          setIds: [...signedOff],
        }),
      })
      if (res.ok) {
        setSeedMessage(`${profile.name}'s starting point is set. Already-known words won't repeat as new.`)
        setSignedOff(new Set())
        onChanged()
      } else {
        setSeedMessage('Could not set the starting point. Try again.')
      }
    } finally {
      setSeeding(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${profile.name}'s profile and all their progress? This cannot be undone.`)) {
      return
    }
    setDeleting(true)
    try {
      await fetch(`/api/profiles?id=${profile.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  const knownWordIds = new Set(
    Object.values(progress).filter((p) => p.stage === 'known').map((p) => p.wordId),
  )

  return (
    <section className="flex flex-col gap-4 bg-card rounded-clay border-4 border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar avatar={profile.avatar} size={40} />
          <h2 className="font-display text-xl font-bold">{profile.name}</h2>
        </div>
        <button
          type="button"
          aria-label={`Delete ${profile.name}'s profile`}
          onClick={handleDelete}
          disabled={deleting}
          style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
          className="flex items-center justify-center rounded-clay border-2 border-border text-red-600
            cursor-pointer select-none disabled:opacity-40
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          <TrashIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
        </button>
      </div>

      {/*
        Where the class is up to, which is not the same thing as where
        this child is -- the operator's own case: "class is up to level 7
        let's practice level 7 then we can go back later. But can
        override." So it marks an island and gates nothing.
      */}
      <div className="flex flex-wrap items-center gap-2 rounded-clay border-2 border-border p-3">
        <label
          htmlFor={`school-set-${profile.id}`}
          className="font-semibold text-sm flex items-center"
          style={{ minHeight: ADULT_TARGET_PX }}
        >
          Which set is {profile.name}'s class working on?
        </label>
        <select
          id={`school-set-${profile.id}`}
          value={school ?? ''}
          onChange={(e) => void pickSchoolSet(e.target.value === '' ? null : Number(e.target.value))}
          style={{ minHeight: ADULT_TARGET_PX }}
          className="rounded-clay border-2 border-border px-3 bg-card cursor-pointer
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          <option value="">Not set</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>{set.name}</option>
          ))}
        </select>
        <p className="w-full text-sm text-muted-foreground leading-normal">
          Marks that island on the map. {profile.name} can still play any island,
          any time.
        </p>
      </div>

      <details className="rounded-clay border-2 border-border p-3">
        <summary className="cursor-pointer font-semibold select-none" style={{ minHeight: ADULT_TARGET_PX }}>
          Set starting point (sets already signed off at school)
        </summary>
        <p className="text-sm text-muted-foreground mt-2 mb-3 leading-normal">
          Tick the sets {profile.name} already brought home signed off. Those words start
          already known, instead of from the beginning.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {sets.map((set) => (
            <label
              key={set.id}
              style={{ minHeight: MIN_TARGET_PX }}
              className="flex items-center gap-2 rounded-clay border-2 border-border px-3 cursor-pointer select-none"
            >
              {/*
                A real 44px box, not a 20px one inside a large label.
                A tick box is its own target even when a label is
                clickable: a parent who taps the box itself -- which is
                what a checkbox invites -- must hit it.
              */}
              <input
                type="checkbox"
                checked={signedOff.has(set.id)}
                onChange={() => toggleSet(set.id)}
                style={{ width: ADULT_TARGET_PX, height: ADULT_TARGET_PX }}
                className="shrink-0"
              />
              {set.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={applyStartingPoint}
          disabled={seeding || signedOff.size === 0}
          style={{ minHeight: MIN_TARGET_PX }}
          className="rounded-clay bg-primary text-on-primary font-bold px-5 cursor-pointer
            disabled:opacity-40 disabled:cursor-not-allowed
            focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
        >
          Apply starting point
        </button>
        {seedMessage && <p role="status" className="text-sm mt-2">{seedMessage}</p>}
      </details>

      <div className="flex flex-col gap-3">
        {sets.map((set) => {
          const known = set.words.filter((w) => knownWordIds.has(w.id)).length
          return (
            <details key={set.id} className="rounded-clay border-2 border-border p-3">
              <summary className="cursor-pointer font-semibold select-none" style={{ minHeight: ADULT_TARGET_PX }}>
                {set.name} -- {known}/{set.words.length} known
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {set.words.map((word) => {
                  const p = progress[word.id]
                  return (
                    <li key={word.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                      <span className="font-word font-bold w-20 shrink-0">{word.text}</span>
                      {/*
                        How far along, and then the sentence that says
                        what that means. The step on its own is the
                        engine talking about itself; the sentence on its
                        own hides which of five steps they are on, and a
                        parent watching a word move week to week wants
                        both. They have to agree, though -- an unmet word
                        read "Step 1 of 6 -- Not met yet", which is two
                        claims and neither of them true. See
                        `wordStepLabel`.
                      */}
                      <span className="shrink-0 rounded-full bg-muted px-2 text-muted-foreground">
                        {wordStepLabel(p)}
                      </span>
                      <span className="text-muted-foreground leading-normal">
                        {summarizeWordProgress(p ?? newProgress(word.id))}
                        {/*
                          What the boxes cannot say: whether anybody has
                          heard them read this word. `WordProgress.saidIt`
                          has promised a parent this since it was added
                          and never showed it -- see `readingSummary`.
                        */}
                        {readingSummary(p) !== '' && (
                          <span data-testid={`reading-${word.id}`} className="block">
                            {readingSummary(p)}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </details>
          )
        })}
      </div>
    </section>
  )
}
