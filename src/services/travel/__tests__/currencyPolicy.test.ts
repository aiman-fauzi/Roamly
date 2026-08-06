import { describe, expect, it } from 'vitest'

import { resolveTravelCurrency } from '@/services/travel/currencyPolicy'

describe('travel currency policy', () => {
  it('uses explicit trip currency first', () => {
    expect(
      resolveTravelCurrency({
        tripCurrency: 'usd',
        userPreferredCurrency: 'MYR',
        originAirportCode: 'KUL',
      })
    ).toEqual({ currency: 'USD', source: 'TRIP_SELECTED' })
  })

  it('uses MYR and USD user preferences before origin defaults', () => {
    expect(
      resolveTravelCurrency({ userPreferredCurrency: 'myr', originAirportCode: 'KUL' })
    ).toEqual({
      currency: 'MYR',
      source: 'USER_PREFERRED',
    })
    expect(
      resolveTravelCurrency({ userPreferredCurrency: 'usd', originAirportCode: 'KUL' })
    ).toEqual({
      currency: 'USD',
      source: 'USER_PREFERRED',
    })
  })

  it('falls back to MYR for Kuala Lumpur origin when trip and user currency are missing', () => {
    expect(resolveTravelCurrency({ originAirportCode: 'KUL' })).toEqual({
      currency: 'MYR',
      source: 'ORIGIN_DEFAULT',
    })
  })

  it('uses the application fallback only after trip, user, and origin defaults are unavailable', () => {
    expect(resolveTravelCurrency({ originAirportCode: 'ZZZ' })).toEqual({
      currency: 'USD',
      source: 'APPLICATION_FALLBACK',
    })
  })
})
