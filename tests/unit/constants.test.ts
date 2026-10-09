import { describe, it, expect } from 'vitest'
import { MIN_TARGET_PX, APP_NAME } from '@/lib/constants'

describe('constants', () => {
  it('sets the child touch target floor to 76px (NN/g 2cm)', () => {
    expect(MIN_TARGET_PX).toBe(76)
  })

  it('names the app', () => {
    expect(APP_NAME).toBe('Tricky Words')
  })
})
