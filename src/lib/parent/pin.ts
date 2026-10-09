import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * The parent PIN is a CHILD GATE, not authentication.
 *
 * It exists to stop a six-year-old wandering into settings and deleting
 * their sibling's progress. It is not designed to resist an adult
 * attacker, and the parent area says so plainly. The real security
 * boundary is the network: family mode belongs on a LAN or behind a VPN.
 *
 * It is still salted and hashed, because storing any secret in clear
 * text teaches the wrong habit and costs nothing to avoid.
 */
export function hashPin(pin: string): string {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits')
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const derived = scryptSync(pin, Buffer.from(saltHex, 'hex'), 32)
    const expected = Buffer.from(hashHex, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
