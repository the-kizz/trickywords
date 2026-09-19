import { z } from 'zod'

/**
 * heart     - mostly regular, with an irregular part to learn by heart
 * decodable - fully regular; frequent, but the child can sound it out
 * family    - regular member of a shared spelling pattern (all/call/ball)
 */
export const classificationSchema = z.enum(['heart', 'decodable', 'family'])
export type Classification = z.infer<typeof classificationSchema>

export const wordSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  graphemes: z.array(z.string().min(1)).min(1),
  phonemes: z.array(z.string().min(1)).min(1),
  trickyIndices: z.array(z.number().int().nonnegative()),
  classification: classificationSchema,
  sentences: z.array(z.string().min(1)).min(1),
  audioId: z.string().min(1),
})
export type Word = z.infer<typeof wordSchema>

export const wordSetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  words: z.array(wordSchema).min(1),
})
export type WordSet = z.infer<typeof wordSetSchema>
