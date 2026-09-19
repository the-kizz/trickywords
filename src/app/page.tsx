import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { isPublicMode } from '@/lib/mode'
import { getDb } from '@/lib/db/client'
import { listProfiles } from '@/lib/db/profiles'
import { MIN_TARGET_PX } from '@/lib/constants'
import { Avatar } from '@/components/avatar/Avatar'
import { Wordmark } from '@/components/brand/Wordmark'
import { HomeGreeting } from '@/components/home/HomeGreeting'

// Reads the profile list and the mode flag at request time -- both can
// change between deploys/edits, and this must never be baked in at
// build time (the build environment has no database to read anyway).
export const dynamic = 'force-dynamic'

/**
 * Family home: pick a child, add a new one, or step into the parent
 * area. In public mode there is no family surface at all -- straight
 * to guest play.
 */
export default async function Home() {
  if (isPublicMode()) redirect('/play')

  const profiles = listProfiles(getDb())

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      {/* The wordmark is the app name. It stays inside an <h1> so the
          page keeps its heading, and the <img> alt carries the name
          for a screen reader. Capped so it never fills a phone
          screen -- the profile chooser below it is the point of this
          page. */}
      <h1 className="w-full flex justify-center">
        <Wordmark className="max-w-[min(20rem,72vw)]" />
      </h1>

      <HomeGreeting />

      <div
        className="flex flex-wrap justify-center gap-6"
        role="group"
        aria-label="Choose who's playing"
      >
        {profiles.map((profile) => (
          <Link
            key={profile.id}
            href={`/play/${profile.id}`}
            aria-label={profile.name}
            style={{ minWidth: MIN_TARGET_PX * 2, minHeight: MIN_TARGET_PX * 2 }}
            className="flex flex-col items-center justify-center gap-2 rounded-clay
              bg-card shadow-clay border-4 border-border px-6 py-6
              text-[clamp(1.25rem,2.2vw,1.5rem)] font-bold cursor-pointer select-none
              focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
          >
            <Avatar avatar={profile.avatar} size={72} />
            <span>{profile.name}</span>
          </Link>
        ))}

        <Link
          href="/parent"
          aria-label="Add someone"
          style={{ minWidth: MIN_TARGET_PX * 2, minHeight: MIN_TARGET_PX * 2 }}
          className="flex flex-col items-center justify-center gap-2 rounded-clay
            bg-muted border-4 border-dashed border-border px-6 py-6
            text-[clamp(1.25rem,2.2vw,1.5rem)] font-bold cursor-pointer select-none
            focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
        >
          <PlusIcon aria-hidden="true" weight="bold" size={48} />
          <span>Add someone</span>
        </Link>
      </div>

      {/*
        Deliberately small and quiet, and last on the page: this is the
        one control on this screen a five-year-old should not be the one
        to tap. Still meets the minimum target size and keeps an
        accessible name -- it just doesn't compete for attention.

        In normal flow, not `absolute`: absolutely positioned in the
        bottom-right corner it was measured overlapping the "Add
        someone" tile at both 390 and 360 wide, so a child tapping the
        bottom of the tile landed in the PIN gate and a parent aiming
        for the PIN gate could hit the tile. `mt-auto` keeps it at the
        end of the column without taking it out of the flow.
      */}
      <Link
        href="/parent"
        aria-label="Parent area"
        style={{ minHeight: MIN_TARGET_PX, minWidth: MIN_TARGET_PX }}
        className="mt-auto flex items-center justify-center px-4
          rounded-clay border-2 border-border text-[clamp(1.125rem,1.6vw,1.25rem)] font-semibold
          text-muted-foreground cursor-pointer select-none
          hover:text-foreground
          focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-fun"
      >
        Parent area
      </Link>
    </main>
  )
}
