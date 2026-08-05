import { describe, expect, it } from 'vitest'

import {
  flightSearchRequestSchema,
  hotelSearchRequestSchema,
  tripTravelPlanningRequestSchema,
} from '@/lib/validations/travelOfferValidation'

describe('travel offer validation', () => {
  it('normalizes flight search airport and currency codes', () => {
    const parsed = flightSearchRequestSchema.parse({
      originAirportCode: ' kul ',
      destinationAirportCode: 'kix',
      departureDate: '2026-09-01',
      returnDate: '2026-09-05',
      adults: '2',
      currency: 'myr',
    })

    expect(parsed).toMatchObject({
      originAirportCode: 'KUL',
      destinationAirportCode: 'KIX',
      adults: 2,
      cabinClass: 'ECONOMY',
      currency: 'MYR',
    })
  })

  it('rejects flight returns before departure', () => {
    const parsed = flightSearchRequestSchema.safeParse({
      originAirportCode: 'KUL',
      destinationAirportCode: 'KIX',
      departureDate: '2026-09-05',
      returnDate: '2026-09-01',
      adults: 1,
      currency: 'MYR',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.returnDate).toContain(
        'Return date must be on or after departure date.'
      )
    }
  })

  it('validates hotel dates and city IDs', () => {
    const parsed = hotelSearchRequestSchema.safeParse({
      cityId: 'not-a-uuid',
      checkInDate: '2026-09-05',
      checkOutDate: '2026-09-05',
      adults: 1,
      rooms: 1,
      currency: 'MYR',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors
      expect(errors.cityId).toBeDefined()
      expect(errors.checkOutDate).toContain('Check-out date must be after check-in date.')
    }
  })

  it('accepts a minimal full trip planning request', () => {
    const parsed = tripTravelPlanningRequestSchema.parse({
      originAirportCode: 'kul',
      departureDate: '2026-09-01',
      adults: 2,
      rooms: 1,
      currency: 'myr',
      simulationMode: 'NORMAL',
    })

    expect(parsed).toMatchObject({
      originAirportCode: 'KUL',
      cabinClass: 'ECONOMY',
      currency: 'MYR',
      simulationMode: 'NORMAL',
    })
  })
})
