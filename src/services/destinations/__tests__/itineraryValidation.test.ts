import { describe, expect, it } from 'vitest'

import {
  attachCandidateMetadataToItinerary,
  ItineraryCandidateValidationError,
  validateItineraryCandidateContract,
} from '@/services/destinations/itineraryValidation'
import type { GeminiDestinationContext } from '@/services/destinations/types'
import type { Itinerary } from '@/types/itinerary'

const context: GeminiDestinationContext = {
  cityId: 'city-1',
  candidateCount: 1,
  omittedCandidateCount: 0,
  serializedSize: 0,
  maxSerializedSize: 12_000,
  clusters: [],
  nearestNeighbors: [],
  candidates: [
    {
      id: 'ATTRACTION:central-market',
      type: 'ATTRACTION',
      name: 'Central Market',
      summary: 'A heritage market.',
      latitude: 3.145,
      longitude: 101.695,
      address: 'Kuala Lumpur',
      categories: ['culture'],
      tags: ['heritage'],
      openingHours: [],
      openingHoursStatus: 'UNKNOWN',
      priceConfidence: 'PRICE_UNKNOWN',
      openingHoursKnown: false,
      ticketPrices: [],
      ticketPriceStatus: 'UNKNOWN',
      estimatedVisitDurationMinutes: 90,
      source: 'openstreetmap',
      officialUrlStatus: 'UNKNOWN',
      lastVerifiedAt: '2026-08-04T00:00:00.000Z',
      factualCompletenessScore: 80,
      staleFactCount: 0,
      factualStatus: 'UNKNOWN',
      factSourceSummary: [],
      rankScore: 88,
      rankReasons: ['interest match'],
      enrichmentState: 'PARTIALLY_ENRICHED',
    },
  ],
}

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
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
    ...overrides,
  }
}

describe('itinerary candidate validation', () => {
  it('accepts supplied candidate IDs and attaches database metadata', () => {
    const valid = itinerary()

    expect(() => validateItineraryCandidateContract(valid, context, { durationDays: 1 })).not.toThrow()

    const enriched = attachCandidateMetadataToItinerary(valid, context)
    expect(enriched.days[0].morning[0]).toMatchObject({
      sourceEntityType: 'ATTRACTION',
      sourceEntityId: 'central-market',
      latitude: 3.145,
      longitude: 101.695,
    })
  })

  it('rejects unknown candidate IDs', () => {
    const invalid = itinerary({
      days: [
        {
          ...itinerary().days[0],
          morning: [
            {
              ...itinerary().days[0].morning[0],
              candidateId: 'ATTRACTION:unknown',
            },
          ],
        },
      ],
    })

    expect(() => validateItineraryCandidateContract(invalid, context, { durationDays: 1 })).toThrow(
      ItineraryCandidateValidationError
    )
  })

  it('rejects duplicate candidate IDs', () => {
    const duplicateItem = itinerary().days[0].morning[0]
    const invalid = itinerary({
      days: [
        {
          ...itinerary().days[0],
          afternoon: [{ ...duplicateItem, time: '14:00' }],
        },
      ],
    })

    expect(() => validateItineraryCandidateContract(invalid, context, { durationDays: 1 })).toThrow(
      /duplicated/
    )
  })

  it('rejects invalid start times and unreasonable durations', () => {
    const invalid = itinerary({
      days: [
        {
          ...itinerary().days[0],
          morning: [
            {
              ...itinerary().days[0].morning[0],
              time: '25:00',
              durationMinutes: 5,
            },
          ],
        },
      ],
    })

    expect(() => validateItineraryCandidateContract(invalid, context, { durationDays: 1 })).toThrow(
      /invalid start time/
    )
  })
})
