import { describe, expect, it, vi } from 'vitest'

import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'

const baseProfile = {
  id: 'profile-1',
  tripId: 'trip-1',
  originCity: 'Kuala Lumpur',
  originCountry: 'Malaysia',
  originAirportCode: 'KUL',
  destinationAirportCode: 'KIX',
  departureDate: new Date('2026-09-01T00:00:00.000Z'),
  returnDate: new Date('2026-09-05T00:00:00.000Z'),
  adults: 2,
  children: 0,
  infants: 0,
  rooms: 1,
  cabinClass: 'ECONOMY',
  nonStopOnly: false,
  currency: 'MYR',
  flightSelectionStrategy: 'BEST_VALUE',
  hotelSelectionStrategy: 'BEST_VALUE',
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
}

describe('TripTravelProfileService', () => {
  it('serializes missing required fields and profile currency fallback', async () => {
    const db = {
      tripTravelProfile: {
        findUnique: vi.fn().mockResolvedValue({ ...baseProfile, currency: null, originAirportCode: null }),
      },
      tripFlightSelection: { findFirst: vi.fn().mockResolvedValue(null) },
      tripHotelSelection: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    const service = new TripTravelProfileService({
      db: db as never,
      getPreferredCurrency: vi.fn().mockResolvedValue('MYR'),
    })

    const result = await service.getForTrip({ tripId: 'trip-1', userId: 'user-1' })

    expect(result.travelProfile).toMatchObject({
      currency: 'MYR',
      currencySource: 'PROFILE',
      departureDate: '2026-09-01',
    })
    expect(result.readiness).toMatchObject({
      planningStatus: 'ACTION_REQUIRED',
      missingRequiredFields: ['originAirportCode'],
      canSearchOffers: false,
    })
  })

  it('invalidates incompatible current selections and current budget when critical fields change', async () => {
    const tx = {
      tripFlightSelection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tripHotelSelection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tripBudgetSnapshot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tripTravelProfile: {
        upsert: vi.fn().mockResolvedValue({
          ...baseProfile,
          originAirportCode: 'SIN',
          updatedAt: new Date('2026-08-05T00:01:00.000Z'),
        }),
      },
    }
    const db = {
      tripTravelProfile: { findUnique: vi.fn().mockResolvedValue(baseProfile) },
      tripFlightSelection: { findFirst: vi.fn().mockResolvedValue(null) },
      tripHotelSelection: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const service = new TripTravelProfileService({
      db: db as never,
      getPreferredCurrency: vi.fn().mockResolvedValue('MYR'),
    })

    const result = await service.upsert({
      tripId: 'trip-1',
      userId: 'user-1',
      data: { originAirportCode: 'SIN' },
    })

    expect(tx.tripFlightSelection.updateMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', status: 'SELECTED' },
      data: { status: 'INVALIDATED' },
    })
    expect(tx.tripHotelSelection.updateMany).not.toHaveBeenCalled()
    expect(tx.tripBudgetSnapshot.updateMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', status: 'CURRENT' },
      data: { status: 'STALE' },
    })
    expect(result.invalidated).toEqual(['flightSelection', 'budgetSnapshot'])
    expect(result.travelProfile.originAirportCode).toBe('SIN')
  })
})
