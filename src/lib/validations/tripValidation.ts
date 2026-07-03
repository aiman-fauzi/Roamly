import { z } from 'zod'

export const tripIdSchema = z.string().uuid('Trip id must be a valid UUID.')

export const tripTitleSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 1, 'Trip title is required.')
  .refine((value) => value.length <= 200, 'Trip title must be 200 characters or fewer.')

export function validateTripId(value: string): { valid: boolean; error?: string } {
  const result = tripIdSchema.safeParse(value)
  if (result.success) return { valid: true }
  return { valid: false, error: result.error.issues[0]?.message }
}