import { z } from 'zod'

const expectedVersion = z.number().int().nonnegative()
const itemId = z.string().min(1).max(260)

export const itineraryReorderSchema = z.object({
  itemId,
  targetDayNumber: z.number().int().positive(),
  targetPeriod: z.enum(['morning', 'afternoon', 'evening']),
  targetIndex: z.number().int().nonnegative(),
  expectedVersion,
})

export const itineraryLockSchema = z.object({
  itemId,
  locked: z.boolean(),
  expectedVersion,
})

export const itineraryNotesSchema = z.object({
  itemId,
  notes: z.string().trim().max(500),
  expectedVersion,
})

export const itineraryReplaceSchema = z.object({
  itemId,
  candidateId: z.string().min(1).max(260),
  expectedVersion,
})

export const itineraryRegenerateDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  expectedVersion,
  acceptFallback: z.boolean().optional().default(false),
})

export const itineraryRevisionMutationSchema = z.object({
  expectedVersion,
})

export type ItineraryReorderInput = z.infer<typeof itineraryReorderSchema>
export type ItineraryLockInput = z.infer<typeof itineraryLockSchema>
export type ItineraryNotesInput = z.infer<typeof itineraryNotesSchema>
export type ItineraryReplaceInput = z.infer<typeof itineraryReplaceSchema>
export type ItineraryRegenerateDayInput = z.infer<typeof itineraryRegenerateDaySchema>
export type ItineraryRevisionMutationInput = z.infer<
  typeof itineraryRevisionMutationSchema
>
