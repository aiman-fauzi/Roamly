import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ItineraryEditorService,
  normalizeEditableItinerary,
} from '../itineraryEditorService'
import type { ItineraryEditorError } from '../itineraryEditorService'

import type { RankedDestinationCandidate } from '@/services/destinations/types'
import type { Itinerary, ItineraryItem } from '@/types/itinerary'

const A = 'ATTRACTION:11111111-1111-4111-8111-111111111111'
const B = 'ATTRACTION:22222222-2222-4222-8222-222222222222'
const C = 'ATTRACTION:33333333-3333-4333-8333-333333333333'
const D = 'ATTRACTION:44444444-4444-4444-8444-444444444444'
const E = 'ATTRACTION:55555555-5555-4555-8555-555555555555'

function item(candidateId: string, time: string, itemId = candidateId): ItineraryItem {
  return {
    itemId,
    candidateId,
    time,
    title: `Place ${candidateId.slice(-4)}`,
    description: 'Trusted description',
    location: 'Bangkok',
    latitude: 13.75,
    longitude: 100.5,
    transport: 'Walk',
    estimatedDuration: '60 min',
    durationMinutes: 60,
    reason: 'Trusted reason',
    estimatedCostLocal: 100,
    estimatedCostUserCurrency: 13,
    currencyLocal: 'THB',
    currencyUser: 'MYR',
    priceConfidence: 'KNOWN_PRICE',
    sourceEntityType: 'ATTRACTION',
    sourceEntityId: candidateId.split(':')[1],
    locked: false,
    editorNotes: '',
    source: 'generated',
    tips: [],
  }
}

function itinerary(): Itinerary {
  return {
    title: 'Bangkok plan',
    summary: 'Two days',
    currencyLocal: 'THB',
    currencyUser: 'MYR',
    exchangeRate: {
      baseCurrency: 'THB',
      quoteCurrency: 'MYR',
      rate: 0.13,
      source: 'test',
      fetchedAt: '2026-08-06T00:00:00.000Z',
      fromCache: false,
    },
    budget: {
      totalBudgetUserCurrency: 1_000,
      estimatedTotalLocal: 200,
      estimatedTotalUserCurrency: 26,
      remainingBudgetUserCurrency: 974,
      isBudgetExceeded: false,
    },
    days: [
      {
        dayNumber: 1,
        theme: 'Old town',
        morning: [item(A, '09:00', 'item-a')],
        afternoon: [item(C, '14:00', 'item-c')],
        evening: [],
        dailyTotalLocal: 200,
        dailyTotalUserCurrency: 26,
        notes: [],
      },
      {
        dayNumber: 2,
        theme: 'Riverside',
        morning: [item(B, '10:00', 'item-b')],
        afternoon: [],
        evening: [],
        dailyTotalLocal: 100,
        dailyTotalUserCurrency: 13,
        notes: [],
      },
    ],
    roadmap: [],
  }
}

function candidate(candidateId: string, name: string): RankedDestinationCandidate {
  const id = candidateId.split(':')[1]
  return {
    candidateId,
    id,
    entityType: 'ATTRACTION',
    entityTable: 'attractions',
    cityId: 'city-1',
    cityName: 'Bangkok',
    citySlug: 'bangkok',
    countryName: 'Thailand',
    countrySlug: 'thailand',
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    description: `${name} description`,
    address: 'Rattanakosin, Bangkok',
    latitude: 13.751,
    longitude: 100.501,
    source: 'OPENSTREETMAP',
    categories: ['culture'],
    tags: [],
    openingHours: [],
    openingHoursStatus: 'UNKNOWN',
    ticketPrices: [],
    ticketPriceStatus: 'UNKNOWN',
    priceConfidence: 'PRICE_UNKNOWN',
    openingHoursKnown: false,
    factualCompletenessScore: 80,
    staleFactCount: 0,
    factualStatus: 'PARTIAL',
    factSourceSummary: [],
    enrichmentState: 'NOT_ENRICHED',
    rankScore: 90,
    rankReasons: ['high confidence'],
  } as unknown as RankedDestinationCandidate
}

function trip(document = itinerary()) {
  return {
    id: 'trip-1',
    userId: 'user-1',
    itineraryJson: document,
    itineraryEditVersion: 2,
    preferenceSet: {
      destination: 'Bangkok',
      travelStyles: ['culture'],
      activityPreferences: ['museums'],
      foodPreferences: [],
    },
    travelProfile: { departureDate: new Date('2026-09-10T00:00:00.000Z') },
  }
}

function createService(document = itinerary()) {
  const loadedTrip = trip(document)
  const persistTrip = vi.fn().mockResolvedValue(true)
  const retrieveCandidates = vi.fn().mockResolvedValue([
    candidate(D, 'Wat Arun'),
    candidate(E, 'Museum Siam'),
  ])
  const findActiveCandidateIds = vi
    .fn()
    .mockImplementation(async (ids: string[]) => new Set(ids))
  const generateDayPlan = vi.fn().mockResolvedValue([
    {
      candidateId: D,
      startTime: '14:00',
      durationMinutes: 75,
      reason: 'Matches the day area and timing.',
    },
  ])
  return {
    persistTrip,
    retrieveCandidates,
    findActiveCandidateIds,
    generateDayPlan,
    service: new ItineraryEditorService({
      loadTrip: vi.fn().mockResolvedValue(loadedTrip),
      persistTrip,
      retrieveCandidates,
      findActiveCandidateIds,
      loadCandidateImages: vi.fn().mockResolvedValue(new Map()),
      generateDayPlan,
    }),
  }
}

describe('ItineraryEditorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes stable editor metadata without changing destination identity', () => {
    const document = itinerary()
    delete document.days[0].morning[0].itemId
    delete document.days[0].morning[0].source

    const normalized = normalizeEditableItinerary(document)

    expect(normalized.days[0].morning[0]).toMatchObject({
      itemId: A,
      candidateId: A,
      source: 'generated',
      locked: false,
    })
  })

  it('moves an item across days to the exact requested period and index', async () => {
    const { service, persistTrip } = createService()

    const result = await service.reorder('trip-1', 'user-1', {
      itemId: 'item-a',
      targetDayNumber: 2,
      targetPeriod: 'evening',
      targetIndex: 0,
      expectedVersion: 2,
    })

    expect(result.version).toBe(3)
    const saved = persistTrip.mock.calls[0][0].itinerary as Itinerary
    expect(saved.days[0].morning).toHaveLength(0)
    expect(saved.days[1].evening.map((entry) => entry.itemId)).toEqual(['item-a'])
    expect(new Set(saved.days.flatMap((day) => [...day.morning, ...day.afternoon, ...day.evening]).map((entry) => entry.candidateId)).size).toBe(3)
  })

  it('rejects a stale version before any persistence attempt', async () => {
    const { service, persistTrip } = createService()

    await expect(
      service.setLock('trip-1', 'user-1', {
        itemId: 'item-a',
        locked: true,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: 'ITINERARY_VERSION_CONFLICT', status: 409 })
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('maps an atomic compare-and-swap miss to a concurrency conflict', async () => {
    const { service, persistTrip } = createService()
    persistTrip.mockResolvedValue(false)

    await expect(
      service.setNotes('trip-1', 'user-1', {
        itemId: 'item-a',
        notes: 'Meet at the east gate',
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: 'ITINERARY_VERSION_CONFLICT', status: 409 })
  })

  it('rejects a client-supplied replacement outside the retrieved candidate set', async () => {
    const { service, persistTrip } = createService()

    await expect(
      service.replace('trip-1', 'user-1', {
        itemId: 'item-a',
        candidateId: 'ATTRACTION:99999999-9999-4999-8999-999999999999',
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: 'DESTINATION_CANDIDATE_NOT_ALLOWED', status: 422 })
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('rebuilds replacement data from the trusted retrieved candidate', async () => {
    const { service, persistTrip } = createService()

    await service.replace('trip-1', 'user-1', {
      itemId: 'item-a',
      candidateId: D,
      expectedVersion: 2,
    })

    const saved = persistTrip.mock.calls[0][0].itinerary as Itinerary
    expect(saved.days[0].morning[0]).toMatchObject({
      itemId: 'item-a',
      candidateId: D,
      title: 'Wat Arun',
      source: 'manual',
      replacedFromCandidateId: A,
      priceConfidence: 'PRICE_UNKNOWN',
    })
  })

  it('rejects a replacement that became inactive before the atomic write', async () => {
    const { service, findActiveCandidateIds, persistTrip } = createService()
    findActiveCandidateIds.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => id !== D)))

    await expect(
      service.replace('trip-1', 'user-1', {
        itemId: 'item-a',
        candidateId: D,
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: 'DESTINATION_CANDIDATE_NOT_ACTIVE', status: 422 })
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('regenerates one day while preserving locked items and every other day', async () => {
    const document = itinerary()
    document.days[0].morning[0].locked = true
    const unchangedDay = structuredClone(document.days[1])
    const { service, persistTrip } = createService(document)

    const result = await service.regenerateDay('trip-1', 'user-1', {
      dayNumber: 1,
      expectedVersion: 2,
      acceptFallback: false,
    })

    expect(result.state).toBe('applied')
    const saved = persistTrip.mock.calls[0][0].itinerary as Itinerary
    expect(saved.days[0].morning[0]).toEqual(document.days[0].morning[0])
    expect(saved.days[0].afternoon[0]).toMatchObject({ candidateId: D, source: 'generated' })
    expect(saved.days[1]).toEqual(unchangedDay)
  })

  it('returns a deterministic fallback proposal without overwriting after Gemini failure', async () => {
    const { service, generateDayPlan, persistTrip } = createService()
    generateDayPlan.mockRejectedValue(new Error('provider down'))

    const result = await service.regenerateDay('trip-1', 'user-1', {
      dayNumber: 1,
      expectedVersion: 2,
      acceptFallback: false,
    })

    expect(result).toMatchObject({ state: 'fallback_ready', version: 2 })
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('protects the arrival window and proposes a timing-safe fallback without writing', async () => {
    const document = itinerary() as Itinerary & {
      itineraryTravelContext: {
        arrivalTiming: { usableDayStart: string }
      }
    }
    document.itineraryTravelContext = {
      arrivalTiming: { usableDayStart: '2026-09-10T12:00:00+07:00' },
    }
    const { service, generateDayPlan, persistTrip } = createService(document)
    generateDayPlan.mockResolvedValue([
      { candidateId: D, startTime: '09:00', durationMinutes: 60, reason: 'Too early' },
    ])

    const result = await service.regenerateDay('trip-1', 'user-1', {
      dayNumber: 1,
      expectedVersion: 2,
      acceptFallback: false,
    })

    expect(result.state).toBe('fallback_ready')
    if (result.state === 'fallback_ready') {
      expect(result.day.morning).toHaveLength(0)
      expect(result.day.afternoon[0].time).toBe('12:00')
    }
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('protects the final-day departure window before persistence', async () => {
    const document = itinerary() as Itinerary & {
      itineraryTravelContext: {
        departureTiming: { latestHotelDeparture: string }
      }
    }
    document.itineraryTravelContext = {
      departureTiming: { latestHotelDeparture: '2026-09-11T11:00:00+07:00' },
    }
    const { service, generateDayPlan, persistTrip } = createService(document)
    generateDayPlan.mockResolvedValue([
      { candidateId: D, startTime: '10:30', durationMinutes: 60, reason: 'Too late' },
    ])

    const result = await service.regenerateDay('trip-1', 'user-1', {
      dayNumber: 2,
      expectedVersion: 2,
      acceptFallback: false,
    })

    expect(result.state).toBe('fallback_ready')
    if (result.state === 'fallback_ready') expect(result.day.morning[0].time).toBe('10:00')
    expect(persistTrip).not.toHaveBeenCalled()
  })

  it('returns map points in final itinerary order with area-group metadata', async () => {
    const document = itinerary() as Itinerary & {
      itineraryTravelContext: {
        planningPreview: {
          rankedRecommendations: Array<{ candidateId: string; areaGroup: string }>
        }
      }
    }
    document.itineraryTravelContext = {
      planningPreview: {
        rankedRecommendations: [{ candidateId: A, areaGroup: 'rattanakosin' }],
      },
    }
    const { service } = createService(document)

    const result = await service.get('trip-1', 'user-1')

    expect(result.mapPoints.map((point) => point.orderIndex)).toEqual([0, 1, 2])
    expect(result.mapPoints[0]).toMatchObject({ candidateId: A, areaGroup: 'rattanakosin' })
  })

  it('does not expose another owner itinerary', async () => {
    const service = new ItineraryEditorService({
      loadTrip: vi.fn().mockResolvedValue(null),
    })

    await expect(service.get('trip-1', 'other-user')).rejects.toEqual(
      expect.objectContaining<Partial<ItineraryEditorError>>({ code: 'TRIP_NOT_FOUND', status: 404 })
    )
  })
})
