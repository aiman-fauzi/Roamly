import { TripStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { GeminiProviderError } from '@/ai/providers/GeminiProvider'
import type { GenerateItineraryResponse } from '@/ai/types'
import type { DestinationRetrievalResult, RankedDestinationCandidate } from '@/services/destinations/types'
import { ItineraryGenerationService } from '@/services/itinerary/itineraryGenerationService'
import type { ItineraryGenerationError } from '@/services/itinerary/itineraryGenerationService'

const trip = {
  id: 'trip-1',
  userId: 'user-1',
  title: 'KL test',
  status: TripStatus.DRAFT,
  itineraryJson: null,
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T00:00:00.000Z'),
}

const preferences = {
  id: 'preferences-1',
  tripId: 'trip-1',
  destination: 'Kuala Lumpur',
  budget: 1000,
  durationDays: 1,
  groupSize: 2,
  travelStyles: ['cultural'],
  foodPreferences: ['local'],
  accommodationType: null,
  transportationPreference: null,
  activityPreferences: ['heritage'],
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T00:00:00.000Z'),
}

const candidate: RankedDestinationCandidate = {
  candidateId: 'ATTRACTION:central-market',
  id: 'central-market',
  entityType: 'ATTRACTION',
  entityTable: 'attractions',
  cityId: 'city-1',
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
  ticketPrices: [],
  ticketPriceStatus: 'UNKNOWN',
  priceConfidence: 'PRICE_UNKNOWN',
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
  cityId: 'city-1',
  candidates: [candidate],
  clusters: [],
  nearestNeighbors: [],
}

function itinerary(candidateId = 'ATTRACTION:central-market'): GenerateItineraryResponse {
  return {
    title: 'Kuala Lumpur in One Day',
    summary: 'A compact city plan.',
    currencyLocal: 'MYR',
    currencyUser: 'MYR',
    exchangeRate: {
      baseCurrency: 'MYR',
      quoteCurrency: 'MYR',
      rate: 1,
      source: 'same_currency',
      fetchedAt: '2026-08-04T00:00:00.000Z',
      fromCache: false,
    },
    budget: {
      totalBudgetUserCurrency: 1000,
      estimatedTotalLocal: 0,
      estimatedTotalUserCurrency: 0,
      remainingBudgetUserCurrency: 1000,
      isBudgetExceeded: false,
    },
    days: [
      {
        dayNumber: 1,
        theme: 'Culture',
        morning: [
          {
            candidateId,
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
            estimatedCostLocal: 0,
            estimatedCostUserCurrency: 0,
            currencyLocal: 'MYR',
            currencyUser: 'MYR',
            priceConfidence: 'PRICE_UNKNOWN',
            tips: [],
          },
        ],
        afternoon: [],
        evening: [],
        dailyTotalLocal: 0,
        dailyTotalUserCurrency: 0,
        notes: [],
      },
    ],
    roadmap: [{ dayNumber: 1, items: [{ label: 'Central Market', kind: 'activity', time: '09:00' }] }],
  }
}

function createService(overrides: Partial<ConstructorParameters<typeof ItineraryGenerationService>[0]> = {}) {
  const persistTrip = vi.fn().mockResolvedValue({
    ...trip,
    status: TripStatus.COMPLETE,
    itineraryJson: itinerary(),
  })

  return {
    persistTrip,
    service: new ItineraryGenerationService({
      getTrip: vi.fn().mockResolvedValue(trip),
      getPreferenceSet: vi.fn().mockResolvedValue(preferences),
      getProfile: vi.fn().mockResolvedValue({
        profileComplete: true,
        preferredCurrency: 'MYR',
        travelInterests: ['culture'],
        preferredLanguage: 'en',
      }),
      resolveCity: vi.fn().mockResolvedValue({
        id: 'city-1',
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
        fetchedAt: new Date('2026-08-04T00:00:00.000Z'),
        fromCache: false,
      }),
      generateItinerary: vi.fn().mockResolvedValue(itinerary()),
      persistTrip,
      ...overrides,
    }),
  }
}

describe('ItineraryGenerationService', () => {
  it('runs a dry-run without persisting the validated itinerary', async () => {
    const { service, persistTrip } = createService()

    const result = await service.generate({ tripId: 'trip-1', maxCandidates: 1 })

    expect(result.summary).toMatchObject({
      mode: 'dry-run',
      eligibleCandidates: 1,
      candidatesSent: 1,
      geminiItemsReturned: 1,
      validItems: 1,
      rejectedItems: 0,
      validationStatus: 'PASSED',
      persisted: false,
      persistenceResult: 'DRY_RUN',
    })
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('persists by replacing the trip itinerary only when persist is explicit', async () => {
    const { service, persistTrip } = createService()

    const result = await service.generate({ tripId: 'trip-1', maxCandidates: 1, persist: true })

    expect(result.summary).toMatchObject({
      mode: 'persist',
      persisted: true,
      persistenceResult: 'REPLACED_TRIP_ITINERARY',
    })
    expect(persistTrip).toHaveBeenCalledWith(
      'trip-1',
      TripStatus.COMPLETE,
      expect.objectContaining({
        days: [
          expect.objectContaining({
            morning: [
              expect.objectContaining({
                sourceEntityType: 'ATTRACTION',
                sourceEntityId: 'central-market',
              }),
            ],
          }),
        ],
      })
    )
  })

  it('rejects unknown candidate IDs before persistence', async () => {
    const { service, persistTrip } = createService({
      generateItinerary: vi.fn().mockResolvedValue(itinerary('ATTRACTION:unknown')),
    })

    await expect(service.generate({ tripId: 'trip-1', maxCandidates: 1, persist: true })).rejects.toMatchObject({
      code: 'AI_CONTRACT_VIOLATION',
      status: 422,
      details: expect.objectContaining({
        category: 'AI_CONTRACT_VIOLATION',
        previousItineraryPreserved: false,
        details: expect.objectContaining({
          validationIssues: expect.arrayContaining([expect.stringContaining('unknown')]),
        }),
      }),
    } satisfies Partial<ItineraryGenerationError>)
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('maps Gemini rate limits to recoverable errors and preserves an existing itinerary', async () => {
    const existingTrip = { ...trip, itineraryJson: itinerary(), status: TripStatus.COMPLETE }
    const { service, persistTrip } = createService({
      getTrip: vi.fn().mockResolvedValue(existingTrip),
      generateItinerary: vi
        .fn()
        .mockRejectedValue(new GeminiProviderError('Rate limited.', 'AI_RATE_LIMITED', 12_000)),
    })

    await expect(service.generate({ tripId: 'trip-1', maxCandidates: 1, persist: true })).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      status: 429,
      details: expect.objectContaining({
        recoverable: true,
        category: 'AI_RATE_LIMITED',
        retryAfterMs: 12_000,
        previousItineraryPreserved: true,
        details: expect.objectContaining({
          candidatesSent: 1,
          validationStatus: 'FAILED',
          validationIssues: expect.arrayContaining([expect.stringContaining('AI_RATE_LIMITED')]),
        }),
      }),
    } satisfies Partial<ItineraryGenerationError>)
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('fails recoverably when no eligible candidates are available', async () => {
    const { service } = createService({
      retrieveDestinations: vi.fn().mockResolvedValue({ ...retrieval, candidates: [] }),
    })

    await expect(service.generate({ tripId: 'trip-1' })).rejects.toMatchObject({
      code: 'INSUFFICIENT_DESTINATION_CANDIDATES',
      status: 400,
      details: expect.objectContaining({
        recoverable: true,
        category: 'INSUFFICIENT_CANDIDATES',
      }),
    } satisfies Partial<ItineraryGenerationError>)
  })

  it('rejects concurrent generation for the same trip', async () => {
    let releaseGeneration: (() => void) | undefined
    const generateItinerary = vi.fn(
      () =>
        new Promise<GenerateItineraryResponse>((resolve) => {
          releaseGeneration = () => resolve(itinerary())
        })
    )
    const { service, persistTrip } = createService({ generateItinerary })

    const first = service.generate({ tripId: 'trip-1', maxCandidates: 1, persist: true })
    await vi.waitFor(() => expect(releaseGeneration).toBeDefined())
    await expect(service.generate({ tripId: 'trip-1', maxCandidates: 1, persist: true })).rejects.toMatchObject({
      code: 'GENERATION_IN_PROGRESS',
      status: 409,
    } satisfies Partial<ItineraryGenerationError>)

    releaseGeneration?.()
    await expect(first).resolves.toMatchObject({
      summary: expect.objectContaining({ persisted: true }),
    })
    expect(persistTrip).toHaveBeenCalledTimes(1)
  })
})
