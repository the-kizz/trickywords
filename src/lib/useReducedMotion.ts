'use client'
import { useEffect, useState } from 'react'

/**
 * Whether the child's system asks for reduced motion.
 *
 * Reads `prefers-reduced-motion` once on mount and on subsequent
 * changes. Defaults to `false` (full motion) so a static layout never
 * flashes onto screen first and gets replaced a tick later.
 *
 * `globals.css` also flattens every animation and transition under the
 * same query; this is the other half of it, for the motion a component
 * has to choose not to start rather than merely shorten -- a reward
 * reveal that springs into place, a word that bobs in its lane.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}
