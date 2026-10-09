'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX, APP_NAME } from '@/lib/constants'
import { PinGate } from './PinGate'
import { ChildProgress } from './ChildProgress'
import { NewProfileForm } from './NewProfileForm'
import { WordSetsEditor } from './WordSetsEditor'
import { VoiceRecorder } from './VoiceRecorder'
import type { Profile } from '@/lib/db/profiles'
import type { WordSet } from '@/lib/words/types'
import type { WordProgress } from '@/lib/engine/types'

interface Props {
  profiles: Profile[]
  progressByProfile: Record<number, Record<string, WordProgress>>
  /**
   * Which set each child's class is working on, where a parent has said.
   * Optional and normally empty -- see `setSchoolSetId`.
   */
  schoolSetByProfile?: Record<number, number | null>
  sets: WordSet[]
  pinIsSet: boolean
}

type Tab = 'children' | 'sets' | 'voices'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'children', label: 'Children' },
  { id: 'sets', label: 'Word sets' },
  { id: 'voices', label: 'Voices' },
]

/**
 * The one adult-facing screen in the app. Locked behind `PinGate` until
 * unlocked for this visit -- unlock state is deliberately not persisted
 * anywhere, so leaving the tab open does not leave the gate open forever.
 */
export function ParentArea({
  profiles, progressByProfile, sets, pinIsSet, schoolSetByProfile,
}: Props) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState<Tab>('children')

  if (!unlocked) {
    return <PinGate pinIsSet={pinIsSet} onUnlocked={() => setUnlocked(true)} />
  }

  const refresh = () => router.refresh()

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-10 w-full">
      {/*
        Back and the heading share a row in normal flow. Absolutely
        positioned in the top-left corner, Back was measured drawn
        straight through the <h1> at 390 wide.
      */}
      <div className="w-full max-w-3xl flex flex-wrap items-center gap-4">
        <Link
          href="/"
          aria-label="Back to home"
          style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
          className="flex items-center gap-1 justify-center px-4
            rounded-clay border-2 border-border text-muted-foreground cursor-pointer select-none
            hover:text-foreground
            focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
        >
          <ArrowLeftIcon aria-hidden="true" weight="bold" size={20} />
          Back
        </Link>

        <h1 className="flex-1 min-w-0 font-display text-2xl font-bold text-center">
          {APP_NAME} -- parent area
        </h1>
      </div>

      <nav role="tablist" aria-label="Parent area sections" className="flex gap-2 flex-wrap justify-center">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ minHeight: MIN_TARGET_PX }}
            className={`rounded-clay px-5 font-semibold cursor-pointer select-none
              ${tab === t.id ? 'bg-primary text-on-primary' : 'bg-card border-2 border-border text-muted-foreground'}
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="w-full max-w-3xl flex flex-col gap-4">
        {tab === 'children' && (
          <>
            {profiles.length === 0 && (
              <p className="text-muted-foreground text-center">No children yet -- add one below.</p>
            )}
            {profiles.map((profile) => (
              <ChildProgress
                key={profile.id}
                profile={profile}
                sets={sets}
                progress={progressByProfile[profile.id] ?? {}}
                schoolSetId={schoolSetByProfile?.[profile.id] ?? null}
                onChanged={refresh}
              />
            ))}
            <NewProfileForm onCreated={refresh} />
          </>
        )}

        {tab === 'sets' && <WordSetsEditor initialSets={sets} onSaved={refresh} />}

        {tab === 'voices' && <VoiceRecorder sets={sets} />}
      </div>
    </main>
  )
}
