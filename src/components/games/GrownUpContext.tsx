'use client'
import { createContext, useContext } from 'react'

/**
 * Whether an adult is sitting with the child for this sitting.
 *
 * A context rather than a prop on every game because only one round
 * cares (`ReadIt`), and threading a flag through `GameProps` would put
 * it in the signature of every round that does not. It is also not the
 * child's state or the word's -- it is a fact about the room.
 *
 * Default false, which is the honest default: the app cannot know
 * anyone is there, and the solo round is the one that promises less.
 * Nothing about it is a lock or a gate -- it changes who judges a
 * reading, and nothing else.
 */
const GrownUpContext = createContext(false)

export const GrownUpProvider = GrownUpContext.Provider

export function useGrownUp(): boolean {
  return useContext(GrownUpContext)
}
