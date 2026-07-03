import { z } from 'zod'

function profileRequiredMessage(label: string) {
  switch (label) {
    case 'Full name':
      return 'Please enter your full name.'
    case 'Country':
      return 'Please choose your country.'
    case 'Region / State':
      return 'Please enter your state or province.'
    default:
      return `Please enter ${label.toLowerCase()}.`
  }
}
function trimmedRequired(label: string, max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1, { message: profileRequiredMessage(label) })
    .refine((value) => value.length <= max, { message: `${label} must be ${max} characters or fewer.` })
}

export const displayNameSchema = trimmedRequired('Full name', 64)

const nullableTrimmed = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
  })

const currencySchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), {
    message: 'Preferred currency must be a 3-letter currency code.',
  })

export const profileSetupSchema = z.object({
  displayName: displayNameSchema,
  country: trimmedRequired('Country', 100),
  region: trimmedRequired('Region / State', 100),
  preferredCurrency: currencySchema,
  travelInterests: z.array(z.string()).default([]),
  preferredLanguage: nullableTrimmed,
})

export const profileUpdateSchema = profileSetupSchema

export type ProfileSetupInput = z.infer<typeof profileSetupSchema>

export function isProfileComplete(profile: {
  displayName?: string | null
  country?: string | null
  region?: string | null
  preferredCurrency?: string | null
}) {
  return Boolean(
    profile.displayName?.trim() &&
      profile.country?.trim() &&
      profile.region?.trim() &&
      /^[A-Z]{3}$/.test(profile.preferredCurrency?.trim().toUpperCase() ?? '')
  )
}

export function validateDisplayName(value: string): { valid: boolean; error?: string } {
  const result = displayNameSchema.safeParse(value)
  if (result.success) return { valid: true }
  return { valid: false, error: result.error.issues[0]?.message }
}

