import { TripStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import type { GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'
import type { DestinationRetrievalResult, RankedDestinationCandidate } from '@/services/destinations/types'
import { MockFlightOfferProvider, MockHotelOfferProvider } from '@/services/travel/offers/mockProviders'
import { TravelOfferService } from '@/services/travel/offers/travelOfferService'
import { TripTravelPlanningService } from '@/services/travel/planning/tripTravelPlanningService'
import type { TravelPlanningError } from '@/services/travel/planning/tripTravelPlanningService'
import type { Itinerary } from '@/types/itinerary'

const trip = {
  id: 'trip-1',
  userId: 'user-1',
  title: 'KL planning test',
  status: TripStatus.DRAFT,
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
  travelStyles: ['cultural'],
  foodPreferences: ['local'],
  accommodationType: 'hotel',
  transportationPreference: 'public_transport',
  activityPreferences: ['heritage'],
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
}

const candidate: RankedDestinationCandidate = {
  candidateId: 'ATTRACTION:central-market',
  id: 'central-market',
  entityType: 'ATTRACTION',
  entityTable: 'attractions',
  cityId: '11111111-1111-4111-8111-111111111111',
  cityName: 'Kuala Lumpur',
  citySlug: 'kuala-lumpur',
  countryName: 'Malaysia',
  countrySlug: 'malaysia',
  name: 'Central Market',
  slug: 'central-market',
  description: 'A heritage market.',
  address: 'Kuala Lumpur',
  latitude: 3.145,
  longitude: 101.695,
  websiteUrl: null,
  source: 'OPENSTREETMAP',
  sourceUrl: null,
  categories: ['culture'],
  tags: ['heritage'],
  openingHours: [],
  openingHoursStatus: 'UNKNOWN',
  priceLevel: null,
  ticketPrices: [{ amount: 10, currency: 'MYR', priceType: 'FIXED', audience: 'GENERAL' }],
  ticketPriceStatus: 'VERIFIED',
  priceConfidence: 'KNOWN_PRICE',
  currency: 'MYR',
  officialUrl: null,
  officialUrlStatus: 'UNKNOWN',
  durationMinutes: 90,
  lastVerifiedAt: new Date('2026-08-04T00:00:00.000Z'),
  openingHoursKnown: false,
  factualCompletenessScore: 80,
  staleFactCount: 0,
  factualStatus: 'UNKNOWN',
  factSourceSummary: [],
  enrichmentState: 'PARTIALLY_ENRICHED',
  enrichment: null,
  distanceFromCityCenterKm: 0.9,
  rankScore: 88,
  rankReasons: ['interest match'],
}

const retrieval: DestinationRetrievalResult = {
  cityId: '11111111-1111-4111-8111-111111111111',
  candidates: [candidate],
  clusters: [],
  nearestNeighbors: [],
}

function itinerary(request: GenerateItineraryRequest, overrides: Partial<Itinerary> = {}): GenerateItineraryResponse {
  return {
    title: 'Kuala Lumpur with Travel Offers',
    summary: 'A grounded plan with selected mock offers.',
    selectedFlightOfferId: request.travelOffersContext?.selectedFlightOfferId,
    selectedHotelOfferId: request.travelOffersContext?.selectedHotelOfferId,
    currencyLocal: 'MYR',
    currencyUser: request.userCurrency,
    exchangeRate: {
      baseCurrency: 'MYR',
      quoteCurrency: request.userCurrency,
      rate: 1,
      source: 'same_currency',
      fetchedAt: '2026-08-05T00:00:00.000Z',
      fromCache: false,
    },
    budget: {
      totalBudgetUserCurrency: request.budget,
      estimatedTotalLocal: 10,
      estimatedTotalUserCurrency: 10,
      remainingBudgetUserCurrency: request.budget - 10,
      isBudgetExceeded: false,
    },
    days: [
      {
        dayNumber: 1,
        theme: 'Culture',
        morning: [
          {
            candidateId: 'ATTRACTION:central-market',
            time: '09:00',
            title: 'Central Market',
            description: 'Explore local culture.',
            location: 'Kuala Lumpur',
            latitude: 3.145,
            longitude: 101.695,
            transport: 'Walk',
            estimatedDuration: '90 minutes',
            durationMinutes: 90,
            reason: 'Matches heritage interests.',
            estimatedCostLocal: 10,
            estimatedCostUserCurrency: 10,
            currencyLocal: 'MYR',
            currencyUser: request.userCurrency,
            priceConfidence: 'KNOWN_PRICE',
            tips: [],
          },
        ],
        afternoon: [],
        evening: [],
        dailyTotalLocal: 10,
        dailyTotalUserCurrency: 10,
        notes: [],
      },
      {
        dayNumber: 2,
        theme: 'Departure',
        morning: [],
        afternoon: [],
        evening: [],
        dailyTotalLocal: 0,
        dailyTotalUserCurrency: 0,
        notes: [],
      },
    ],
    roadmap: [{ dayNumber: 1, items: [{ label: 'Central Market', kind: 'activity', time: '09:00' }] }],
    ...overrides,
  }
}

function createService(overrides: Partial<ConstructorParameters<typeof TripTravelPlanningService>[0]> = {}) {
  const now = new Date('2026-08-05T00:00:00.000Z')
  const generateItinerary = vi.fn(async (request: GenerateItineraryRequest) => itinerary(request))
  const persistTrip = vi.fn().mockResolvedValue({
    ...trip,
    status: TripStatus.COMPLETE,
    itineraryJson: {},
  })

  return {
    generateItinerary,
    persistTrip,
    service: new TripTravelPlanningService({
      getTrip: vi.fn().mockResolvedValue(trip),
      getPreferenceSet: vi.fn().mockResolvedValue(preferences),
      getProfile: vi.fn().mockResolvedValue({
        profileComplete: true,
        preferredCurrency: 'MYR',
        travelInterests: ['culture'],
        preferredLanguage: 'en',
      }),
      resolveCity: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Kuala Lumpur',
        slug: 'kuala-lumpur',
        countryName: 'Malaysia',
        countrySlug: 'malaysia',
        currencyCode: 'MYR',
      }),
      retrieveDestinations: vi.fn().mockResolvedValue(retrieval),
      resolveExchangeRate: vi.fn().mockResolvedValue({
        baseCurrency: 'MYR',
        quoteCurrency: 'MYR',
        rate: 1,
        source: 'same_currency',
        fetchedAt: now,
        fromCache: false,
      }),
      travelOfferService: new TravelOfferService({
        flightProvider: new MockFlightOfferProvider(() => now),
        hotelProvider: new MockHotelOfferProvider(() => now),
        now: () => now,
      }),
      generateItinerary,
      persistTrip,
      ...overrides,
    }),
  }
}

describe('TripTravelPlanningService', () => {
  it('runs a full mocked orchestration and persists only validated output', async () => {
    const { service, persistTrip, generateItinerary } = createService()

    const result = await service.plan({
      tripId: 'trip-1',
      userId: 'user-1',
      input: {
        originAirportCode: 'KUL',
        departureDate: '2026-09-01',
        returnDate: '2026-09-03',
        adults: 2,
        rooms: 1,
        currency: 'MYR',
        cabinClass: 'ECONOMY',
        persist: true,
        simulationMode: 'NORMAL',
        maxCandidates: 1,
      },
    })

    expect(result.flightSearch.offers).toHaveLength(2)
    expect(result.hotelSearch.offers).toHaveLength(2)
    expect(result.summary).toMatchObject({
      flightOffersReturned: 2,
      hotelOffersReturned: 2,
      selectedFlightOfferId: result.selectedFlightOffer.id,
      selectedHotelOfferId: result.selectedHotelOffer.id,
      knownAttractionCost: { amount: '20.00', currency: 'MYR' },
      wholeTripTotal: { amount: '2002.00', currency: 'MYR' },
      perPersonTotal: { amount: '1001.00', currency: 'MYR' },
      candidatesSentToGemini: 1,
      validItineraryItems: 1,
      validationStatus: 'PASSED',
      persisted: true,
    })
    expect(result.itinerary.selectedFlightOfferId).toBe(result.selectedFlightOffer.id)
    expect(result.itinerary.selectedHotelOfferId).toBe(result.selectedHotelOffer.id)
    expect(generateItinerary).toHaveBeenCalledWith(
      expect.objectContaining({
        travelOffersContext: expect.objectContaining({
          selectedFlightOfferId: result.selectedFlightOffer.id,
          selectedHotelOfferId: result.selectedHotelOffer.id,
        }),
        budgetSummary: expect.objectContaining({
          total: expect.objectContaining({
            amount: { amount: '2002.00', currency: 'MYR' },
          }),
        }),
      })
    )
    expect(JSON.stringify(generateItinerary.mock.calls[0][0].travelOffersContext)).not.toContain('providerOfferId')
    expect(persistTrip).toHaveBeenCalledTimes(1)
  })

  it('rejects unknown selected offer IDs before calling Gemini', async () => {
    const { service, persistTrip, generateItinerary } = createService()

    await expect(
      service.plan({
        tripId: 'trip-1',
        userId: 'user-1',
        input: {
          originAirportCode: 'KUL',
          departureDate: '2026-09-01',
          adults: 2,
          rooms: 1,
          currency: 'MYR',
          cabinClass: 'ECONOMY',
          selectedFlightOfferId: 'missing-flight-offer',
          persist: true,
        },
      })
    ).rejects.toMatchObject({
      code: 'UNKNOWN_FLIGHT_OFFER_ID',
      status: 422,
      details: expect.objectContaining({
        recoverable: true,
        category: 'INVALID_SELECTION',
      }),
    } satisfies Partial<TravelPlanningError>)

    expect(generateItinerary).not.toHaveBeenCalled()
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('categorizes provider rate limits and preserves previous itinerary state', async () => {
    const existingTrip = { ...trip, itineraryJson: { title: 'Existing plan' }, status: TripStatus.COMPLETE }
    const { service, persistTrip, generateItinerary } = createService({
      getTrip: vi.fn().mockResolvedValue(existingTrip),
    })

    await expect(
      service.plan({
        tripId: 'trip-1',
        userId: 'user-1',
        input: {
          originAirportCode: 'KUL',
          departureDate: '2026-09-01',
          adults: 2,
          rooms: 1,
          currency: 'MYR',
          cabinClass: 'ECONOMY',
          simulationMode: 'RATE_LIMITED',
          persist: true,
        },
      })
    ).rejects.toMatchObject({
      code: 'FLIGHT_OFFERS_UNAVAILABLE',
      status: 429,
      details: expect.objectContaining({
        category: 'RATE_LIMITED',
        previousItineraryPreserved: true,
      }),
    } satisfies Partial<TravelPlanningError>)

    expect(generateItinerary).not.toHaveBeenCalled()
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('rejects unsupported offer IDs returned by Gemini before persistence', async () => {
    const existingTrip = { ...trip, itineraryJson: { title: 'Existing plan' }, status: TripStatus.COMPLETE }
    const generateItinerary = vi.fn(async (request: GenerateItineraryRequest) =>
      itinerary(request, { selectedFlightOfferId: 'flight-offer-from-nowhere' })
    )
    const { service, persistTrip } = createService({
      getTrip: vi.fn().mockResolvedValue(existingTrip),
      generateItinerary,
    })

    await expect(
      service.plan({
        tripId: 'trip-1',
        userId: 'user-1',
        input: {
          originAirportCode: 'KUL',
          departureDate: '2026-09-01',
          adults: 2,
          rooms: 1,
          currency: 'MYR',
          cabinClass: 'ECONOMY',
          persist: true,
        },
      })
    ).rejects.toMatchObject({
      code: 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION',
      status: 422,
      details: expect.objectContaining({
        category: 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION',
        previousItineraryPreserved: true,
      }),
    } satisfies Partial<TravelPlanningError>)

    expect(persistTrip).not.toHaveBeenCalled()
  })
})
