import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Avatar, AVATAR_IDS, AVATAR_LABELS } from '@/components/avatar/Avatar'

describe('Avatar', () => {
  it('renders a picture, never a letter', () => {
    const { container } = render(<Avatar avatar="fox" />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('points each known avatar at its own committed local file, never a network URL', () => {
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<Avatar avatar={id} />)
      const img = container.querySelector('img')
      expect(img?.getAttribute('src')).toBe(`/avatars/avatar-${id}.webp`)
      unmount()
    }
  })

  it('gives every known avatar an accessible name', () => {
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<Avatar avatar={id} />)
      const img = container.querySelector('img')
      expect(img?.getAttribute('alt')).toBe(AVATAR_LABELS[id])
      unmount()
    }
  })

  it('falls back sensibly for an unknown avatar id', () => {
    const { container } = render(<Avatar avatar="not-a-real-avatar" />)
    expect(container.querySelector('img')).toBeNull()
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(container.querySelector('text')).toBeNull()
    expect(svg?.getAttribute('aria-label')).toBeTruthy()
  })

  /*
   * A profile created before the illustrated cut-outs landed still holds
   * one of the old generated ids ('sunny', 'breeze', 'berry', 'clover',
   * 'coral', 'ember', 'mist', 'plum'). Those files are gone, so the id
   * must fall through to the fallback face rather than request a 404.
   */
  it('falls back for a legacy avatar id from the old placeholder set', () => {
    for (const legacy of ['sunny', 'breeze', 'berry', 'clover', 'coral', 'ember', 'mist', 'plum']) {
      const { container, unmount } = render(<Avatar avatar={legacy} />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('svg')?.getAttribute('aria-label')).toBeTruthy()
      unmount()
    }
  })

  it('gives each known avatar a distinct source file', () => {
    const srcs = AVATAR_IDS.map((id) => {
      const { container, unmount } = render(<Avatar avatar={id} />)
      const src = container.querySelector('img')?.getAttribute('src')
      unmount()
      return src
    })
    expect(new Set(srcs).size).toBe(AVATAR_IDS.length)
  })
})
