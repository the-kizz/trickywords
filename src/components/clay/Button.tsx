'use client'
import { motion } from 'motion/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { ReactNode } from 'react'

interface Props {
  label?: string
  ariaLabel?: string
  icon?: boolean
  tone?: 'primary' | 'play' | 'fun'
  onPress: () => void
  children?: ReactNode
}

const TONES = {
  primary: 'bg-primary text-on-primary',
  play: 'bg-play text-on-play',
  fun: 'bg-fun text-white',
} as const

export function ClayButton({
  label, ariaLabel, icon, tone = 'primary', onPress, children,
}: Props) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
      className={`${TONES[tone]} rounded-clay shadow-clay px-6 py-4
        text-[clamp(1.25rem,2.4vw,1.75rem)] font-bold cursor-pointer select-none
        focus-visible:outline-4 focus-visible:outline-offset-4
        focus-visible:outline-fun`}
    >
      {children ?? (icon ? null : label)}
    </motion.button>
  )
}
