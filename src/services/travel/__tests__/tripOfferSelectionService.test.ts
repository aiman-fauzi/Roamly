import { describe, expect, it, vi } from 'vitest'

import { money } from '@/services/travel/offers/money'
import type { FlightOffer, FlightSearchResult } from '@/services/travel/offers/types'
import { TripOfferSelectionService } from '@/services/travel/persistence/tripOfferSelectionService'
import type { TripOfferSelectionError } from '@/services/travel/persistence/tripOfferSelectionService'

const trip = {
  id: 'trip-1',
  userId: 'user-1',
  title: 'Selection test',
  status: 'DRAFT',
  itineraryJson: null,
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
}

const preferences = {
  id: 'preferences-1',
  tripId: 'trip-1',
  destination: 'Kuala Lumpur',
  budget: 2000,
  durationDays: 2,
  groupSize: 2,
  travelStyles: [],
  foodPreferences: [],
  accommodationType: null,
  transportationPreference: null,
  activityPreferences: [],
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
}

const travelProfile = {
  id: 'profile-1',
  tripId: 'trip-1',
  originCity: null,
  originCountry: null,
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

const flightOffer: FlightOffer = {
  id: 'flight-own-search',
  provider: 'mock',
  providerOfferId: 'provider-flight-1',
  itineraries: [
    {
      durationMinutes: 120,
      stopCount: 0,
      segments: [
        {
          departureAirportCode: 'KUL',
          arrivalAirportCode: 'KIX',
          departureAt: '2026-09-01T08:00:00.000Z',
          arrivalAt: '2026-09-01T10:00:00.000Z',
          carrierCode: 'RM',
          flightNumber: '101',
          durationMinutes: 120,
        },
      ],
    },
  ],
  totalPrice: money('840.00', 'MYR'),
  baggage: { checkedBags: 1 },
  refundable: false,
  fetchedAt: '2026-08-05T00:00:00.000Z',
  expiresAt: '2026-08-05T00:15:00.000Z',
}

const flightResult: FlightSearchResult = {
  status: 'SUCCESS',
  provider: 'mock',
  fetchedAt: '2026-08-05T00:00:00.000Z',
  expiresAt: '2026-08-05T00:15:00.000Z',
  cacheStatus: 'HIT',
  requestFingerprint: 'fingerprint-1',
  offers: [flightOffer],
}

interface SelectionTxMock {
  tripFlightSelection: {
    findFirst: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  tripBudgetSnapshot: {
    updateMany: ReturnType<typeof vi.fn>
  }
}

function createService(overrides: {
  tx?: SelectionTxMock
  flightSearch?: FlightSearchResult
} = {}) {
  const tx: SelectionTxMock = overrides.tx ?? {
    tripFlightSelection: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'selection-1',
          ...data,
          selectedAt: new Date('2026-08-05T00:01:00.000Z'),
          status: 'SELECTED',
          createdAt: new Date('2026-08-05T00:01:00.000Z'),
          updatedAt: new Date('2026-08-05T00:01:00.000Z'),
        })
      ),
    },
    tripBudgetSnapshot: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
  const db = {
    tripTravelProfile: { findUnique: vi.fn().mockResolvedValue(travelProfile) },
    tripFlightSelection: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tripHotelSelection: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tripBudgetSnapshot: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (callback) => callback(tx)),
  }

  return {
    tx,
    service: new TripOfferSelectionService({
      db: db as never,
      getTrip: vi.fn().mockResolvedValue(trip),
      getPreferenceSet: vi.fn().mockResolvedValue(preferences),
      getPreferredCurrency: vi.fn().mockResolvedValue('MYR'),
      resolveCity: vi.fn().mockResolvedValue({
        id: 'city-1',
        name: 'Kuala Lumpur',
        slug: 'kuala-lumpur',
        countryName: 'Malaysia',
        countrySlug: 'malaysia',
        currencyCode: 'MYR',
      }),
      travelOfferService: {
        searchFlights: vi.fn().mockResolvedValue(overrides.flightSearch ?? flightResult),
        searchHotels: vi.fn(),
      },
      now: () => new Date('2026-08-05T00:05:00.000Z'),
    }),
  }
}

describe('TripOfferSelectionService', () => {
  it('refuses unknown or cross-trip flight offer IDs', async () => {
    const { service } = createService()

    await expect(
      service.selectFlight({
        tripId: 'trip-1',
        userId: 'user-1',
        offerId: 'flight-from-another-search',
      })
    ).rejects.toMatchObject({
      code: 'UNKNOWN_FLIGHT_OFFER_ID',
      status: 422,
    } satisfies Partial<TripOfferSelectionError>)
  })

  it('refuses expired offer search results', async () => {
    const { service } = createService({
      flightSearch: {
        ...flightResult,
        expiresAt: '2026-08-05T00:01:00.000Z',
      },
    })

    await expect(
      service.selectFlight({
        tripId: 'trip-1',
        userId: 'user-1',
        offerId: flightOffer.id,
      })
    ).rejects.toMatchObject({
      code: 'OFFER_SEARCH_EXPIRED',
      status: 409,
    } satisfies Partial<TripOfferSelectionError>)
  })

  it('persists a sanitized snapshot and replaces prior selected flights', async () => {
    const { service, tx } = createService()

    const selection = await service.selectFlight({
      tripId: 'trip-1',
      userId: 'user-1',
      offerId: flightOffer.id,
    })

    expect(tx.tripFlightSelection.updateMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', status: 'SELECTED' },
      data: { status: 'REPLACED' },
    })
    expect(tx.tripFlightSelection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerKey: 'mock',
        providerOfferId: 'provider-flight-1',
        searchFingerprint: 'fingerprint-1',
        itinerarySummary: expect.any(Array),
        baggageSummary: { checkedBags: 1 },
      }),
    })
    expect(selection).toMatchObject({
      id: 'selection-1',
      offerId: flightOffer.id,
      originalPrice: { amount: '840.00', currency: 'MYR' },
      convertedPrice: { amount: '840.00', currency: 'MYR' },
      selectionSource: 'USER_SELECTED',
      isExpired: false,
    })
    expect(JSON.stringify(selection)).not.toContain('bookingUrl')
  })
})
