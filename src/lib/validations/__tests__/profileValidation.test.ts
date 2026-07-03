import { describe, expect, it } from 'vitest'

import { getSuggestedCurrency } from '@/constants/countries'
import {
  isProfileComplete,
  profileSetupSchema,
  validateDisplayName,
} from '@/lib/validations/profileValidation'

describe('profileValidation', () => {
  it('keeps display name validation compatible with existing profile editing', () => {
    expect(validateDisplayName(' Aiman ').valid).toBe(true)
    expect(validateDisplayName('   ').valid).toBe(false)
  })

  it('rejects incomplete required setup fields', () => {
    const result = profileSetupSchema.safeParse({
      displayName: '',
      country: '',
      region: '',
      preferredCurrency: '',
      travelInterests: [],
      preferredLanguage: null,
    })

    expect(result.success).toBe(false)
  })

  it('normalizes currency and computes completion', () => {
    const parsed = profileSetupSchema.parse({
      displayName: ' Aiman ',
      country: ' Malaysia ',
      region: ' Selangor ',
      preferredCurrency: 'myr',
      travelInterests: ['food', 'culture'],
      preferredLanguage: '',
    })

    expect(parsed).toMatchObject({
      displayName: 'Aiman',
      country: 'Malaysia',
      region: 'Selangor',
      preferredCurrency: 'MYR',
      preferredLanguage: null,
    })
    expect(isProfileComplete(parsed)).toBe(true)
  })

  it('suggests currency from supported countries', () => {
    expect(getSuggestedCurrency('Malaysia')).toBe('MYR')
    expect(getSuggestedCurrency('Japan')).toBe('JPY')
    expect(getSuggestedCurrency('United States')).toBe('USD')
    expect(getSuggestedCurrency('United Kingdom')).toBe('GBP')
    expect(getSuggestedCurrency('Australia')).toBe('AUD')
    expect(getSuggestedCurrency('Atlantis')).toBeNull()
  })
})
