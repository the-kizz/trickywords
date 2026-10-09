export type AppMode = 'family' | 'public'

/**
 * Fails closed to 'family'. A typo in the env var must never produce a
 * public deployment the operator believes is private — the opposite
 * mistake is loud and harmless.
 */
export function resolveMode(env: Record<string, string | undefined>): AppMode {
  return env.TRICKYWORDS_MODE?.trim().toLowerCase() === 'public'
    ? 'public'
    : 'family'
}

export const isPublicMode = () => resolveMode(process.env) === 'public'
export const isFamilyMode = () => resolveMode(process.env) === 'family'
