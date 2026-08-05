import {
  DestinationFactEntityType,
  DestinationFactSourceTier,
  DestinationFactStatus,
  DestinationFactType,
  DestinationImportSource,
} from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  DestinationRetrievalService,
  filterEligibleDestinationCandidates,
  rankDestinationCandidates,
} from '@/services/destinations/destinationRetrievalService'
import { destinationFactKey } from '@/services/destinations/facts/destinationFactService'
import { buildGeminiDestinationContext } from '@/services/destinations/geminiContext'
import {
  buildNearestNeighbors,
  groupNearbyCandidates,
  haversineDistanceKm,
} from '@/services/destinations/geo'
import type {
  DestinationCandidate,
  DestinationRetrievalResult,
  RankedDestinationCandidate,
} from '@/services/destinations/types'

function candidate(overrides: Partial<DestinationCandidate>): DestinationCandidate {
  return {
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
    description: 'A heritage market with culture, crafts, and local food.',
    address: 'Kuala Lumpur',
    latitude: 3.145,
    longitude: 101.695,
    websiteUrl: 'https://example.com/central-market',
    source: DestinationImportSource.OPENSTREETMAP,
    sourceUrl: 'https://example.com/central-market',
    categories: ['culture'],
    tags: ['heritage', 'shopping'],
    openingHours: [],
    openingHoursStatus: 'UNKNOWN',
    priceLevel: null,
    ticketPrices: [],
    ticketPriceStatus: 'UNKNOWN',
    priceConfidence: 'PRICE_UNKNOWN',
    currency: 'MYR',
    officialUrl: 'https://example.com/central-market',
    officialUrlStatus: 'PARTIAL',
    durationMinutes: 90,
    lastVerifiedAt: new Date('2026-08-04T00:00:00.000Z'),
    openingHoursKnown: false,
    factualCompletenessScore: 80,
    staleFactCount: 0,
    factualStatus: 'PARTIAL',
    factSourceSummary: [],
    enrichmentState: 'PARTIALLY_ENRICHED',
    enrichment: null,
    distanceFromCityCenterKm: 0.9,
    ...overrides,
  } as DestinationCandidate
}

function ranked(overrides: Partial<RankedDestinationCandidate>): RankedDestinationCandidate {
  return {
    ...candidate({}),
    rankScore: 80,
    rankReasons: ['test reason'],
    ...overrides,
  }
}

describe('destination retrieval helpers', () => {
  it('filters candidates by city and excludes legacy broad guide pages', () => {
    const eligible = filterEligibleDestinationCandidates(
      [
        candidate({}),
        candidate({
          candidateId: 'ATTRACTION:other-city',
          id: 'other-city',
          cityId: 'city-2',
        }),
        candidate({
          candidateId: 'ATTRACTION:kuala-lumpur',
          id: 'legacy-kuala-lumpur',
          name: 'Kuala Lumpur',
          slug: 'kuala-lumpur',
          source: DestinationImportSource.WIKIVOYAGE,
          sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
          description: 'Kuala Lumpur is a city in Malaysia.',
        }),
        candidate({
          candidateId: 'ATTRACTION:national-mosque',
          id: 'national-mosque',
          name: 'National Mosque',
          slug: 'national-mosque',
          source: DestinationImportSource.WIKIVOYAGE,
          sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FBotanical_Garden',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FBotanical_Garden',
        }),
      ],
      { cityId: 'city-1' }
    )

    expect(eligible.map((item) => item.candidateId)).toEqual([
      'ATTRACTION:central-market',
      'ATTRACTION:national-mosque',
    ])
  })

  it('ranks interest and travel-style matches ahead of generic candidates', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({}),
        candidate({
          candidateId: 'RESTAURANT:generic',
          id: 'generic',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Generic Cafe',
          slug: 'generic-cafe',
          description: 'A simple cafe.',
          tags: [],
          categories: [],
          distanceFromCityCenterKm: 10,
        }),
      ],
      {
        cityId: 'city-1',
        interests: ['heritage', 'local food'],
        travelStyles: ['cultural'],
      }
    )

    expect(rankedCandidates[0].name).toBe('Central Market')
    expect(rankedCandidates[0].rankReasons.join(' ')).toContain('interest')
    expect(rankedCandidates[0].rankReasons.join(' ')).toContain('cultural')
  })

  it('uses structured price tiers only as estimated price confidence', () => {
    const [rankedCandidate] = rankDestinationCandidates(
      [
        candidate({
          priceLevel: 2,
          priceConfidence: 'ESTIMATED_PRICE',
        }),
      ],
      { cityId: 'city-1', budgetLevel: 'budget' }
    )

    expect(rankedCandidate.priceConfidence).toBe('ESTIMATED_PRICE')
    expect(rankedCandidate.rankReasons).toContain('estimated_price')
  })

  it('moderately rewards factual completeness and marks stale facts in rank reasons', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'ATTRACTION:complete',
          id: 'complete',
          name: 'Complete Museum',
          openingHours: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00', isClosed: false }],
          openingHoursStatus: 'VERIFIED',
          openingHoursKnown: true,
          priceLevel: 1,
          ticketPrices: [{ amount: 10, currency: 'MYR', priceType: 'FIXED', audience: 'GENERAL' }],
          ticketPriceStatus: 'VERIFIED',
          priceConfidence: 'ESTIMATED_PRICE',
          factualCompletenessScore: 100,
          staleFactCount: 0,
        }),
        candidate({
          candidateId: 'ATTRACTION:thin',
          id: 'thin',
          name: 'Thin Listing',
          factualCompletenessScore: 30,
          staleFactCount: 3,
        }),
      ],
      { cityId: 'city-1' }
    )

    expect(rankedCandidates[0].candidateId).toBe('ATTRACTION:complete')
    expect(rankedCandidates[0].rankReasons).toContain('opening_hours_verified')
    expect(rankedCandidates[1].rankReasons.join(' ')).toContain('stale fact marker')
  })

  it('calculates Haversine distance in kilometres', () => {
    const distance = haversineDistanceKm(
      { latitude: 3.1394, longitude: 101.6893 },
      { latitude: 3.1494, longitude: 101.6893 }
    )

    expect(distance).toBeGreaterThan(1)
    expect(distance).toBeLessThan(1.2)
  })

  it('groups nearby candidates and exposes nearest-neighbour distances', () => {
    const candidates = [
      ranked({ candidateId: 'ATTRACTION:a', latitude: 3.14, longitude: 101.69 }),
      ranked({ candidateId: 'ATTRACTION:b', latitude: 3.141, longitude: 101.691 }),
      ranked({ candidateId: 'ATTRACTION:c', latitude: 3.3, longitude: 101.9 }),
    ]

    const clusters = groupNearbyCandidates(candidates, 0.5)
    const neighbors = buildNearestNeighbors(candidates, 1)

    expect(clusters[0].candidateIds).toEqual(['ATTRACTION:a', 'ATTRACTION:b'])
    expect(neighbors.find((entry) => entry.candidateId === 'ATTRACTION:a')?.neighbors[0]).toMatchObject({
      candidateId: 'ATTRACTION:b',
    })
  })

  it('serializes a compact Gemini context within count and size limits', () => {
    const retrieval: DestinationRetrievalResult = {
      cityId: 'city-1',
      candidates: [
        ranked({ candidateId: 'ATTRACTION:a', id: 'a', name: 'A' }),
        ranked({ candidateId: 'ATTRACTION:b', id: 'b', name: 'B' }),
      ],
      clusters: [
        {
          id: 'cluster-1',
          centerLatitude: 3.14,
          centerLongitude: 101.69,
          candidateIds: ['ATTRACTION:a', 'ATTRACTION:b'],
          averageRankScore: 80,
        },
      ],
      nearestNeighbors: [],
    }

    const context = buildGeminiDestinationContext(retrieval, {
      maxCandidates: 1,
      maxSerializedSize: 2_000,
    })

    expect(context.candidates).toHaveLength(1)
    expect(context.omittedCandidateCount).toBe(1)
    expect(context.serializedSize).toBeLessThanOrEqual(2_000)
    expect(context.candidates[0]).toMatchObject({
      openingHoursKnown: false,
      openingHoursStatus: 'UNKNOWN',
      priceConfidence: 'PRICE_UNKNOWN',
      ticketPriceStatus: 'UNKNOWN',
      lastVerifiedAt: '2026-08-04T00:00:00.000Z',
      factualCompletenessScore: 80,
      staleFactCount: 0,
    })
  })

  it('seeds compact Gemini context with attraction, restaurant, and activity candidates when available', () => {
    const retrieval: DestinationRetrievalResult = {
      cityId: 'city-1',
      candidates: [
        ranked({ candidateId: 'ATTRACTION:a', id: 'a', entityType: 'ATTRACTION', name: 'A', rankScore: 100 }),
        ranked({ candidateId: 'ATTRACTION:b', id: 'b', entityType: 'ATTRACTION', name: 'B', rankScore: 99 }),
        ranked({
          candidateId: 'RESTAURANT:c',
          id: 'c',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'C',
          rankScore: 80,
        }),
        ranked({
          candidateId: 'ACTIVITY:d',
          id: 'd',
          entityType: 'ACTIVITY',
          entityTable: 'activities',
          name: 'D',
          rankScore: 70,
        }),
      ],
      clusters: [],
      nearestNeighbors: [],
    }

    const context = buildGeminiDestinationContext(retrieval, {
      maxCandidates: 3,
      maxSerializedSize: 6_000,
    })

    expect(context.candidates.map((candidate) => candidate.id)).toEqual([
      'ATTRACTION:a',
      'RESTAURANT:c',
      'ACTIVITY:d',
    ])
    expect(context.omittedCandidateCount).toBe(1)
  })

  it('budgets context size using only clusters and neighbors for selected candidates', () => {
    const retrieval: DestinationRetrievalResult = {
      cityId: 'city-1',
      candidates: [
        ranked({ candidateId: 'ATTRACTION:a', id: 'a', name: 'A' }),
        ranked({ candidateId: 'RESTAURANT:b', id: 'b', entityType: 'RESTAURANT', name: 'B' }),
      ],
      clusters: [
        {
          id: 'selected-cluster',
          centerLatitude: 3.14,
          centerLongitude: 101.69,
          candidateIds: ['ATTRACTION:a', 'RESTAURANT:b', 'OMITTED:1'],
          averageRankScore: 80,
        },
      ],
      nearestNeighbors: Array.from({ length: 80 }, (_, index) => ({
        candidateId: `OMITTED:${index}`,
        neighbors: [{ candidateId: `OMITTED:${index + 1}`, distanceKm: index }],
      })),
    }

    const context = buildGeminiDestinationContext(retrieval, {
      maxCandidates: 2,
      maxSerializedSize: 2_500,
    })

    expect(context.candidates).toHaveLength(2)
    expect(context.clusters[0].candidateIds).toEqual(['ATTRACTION:a', 'RESTAURANT:b'])
    expect(context.nearestNeighbors).toEqual([])
    expect(context.serializedSize).toBeLessThanOrEqual(2_500)
  })

  it('loads persisted effective facts before ranking and context generation', async () => {
    const verifiedAt = new Date('2026-08-04T00:00:00.000Z')
    const db = {
      attraction: {
        findMany: async () => [
          {
            id: 'central-market',
            cityId: 'city-1',
            name: 'Central Market',
            slug: 'central-market',
            description: 'A heritage market.',
            address: null,
            latitude: 3.145,
            longitude: 101.695,
            websiteUrl: null,
            phone: null,
            priceLevel: null,
            durationMinutes: null,
            updatedAt: verifiedAt,
            city: {
              id: 'city-1',
              name: 'Kuala Lumpur',
              slug: 'kuala-lumpur',
              latitude: 3.1394,
              longitude: 101.6893,
              country: { name: 'Malaysia', slug: 'malaysia', currencyCode: 'MYR' },
            },
            tags: [],
            openingHours: [],
            enrichment: null,
          },
        ],
      },
      restaurant: { findMany: async () => [] },
      hotel: { findMany: async () => [] },
      activity: { findMany: async () => [] },
    }
    const ref = { entityType: DestinationFactEntityType.ATTRACTION, entityId: 'central-market' }
    const factService = {
      resolveEffectiveFactsForEntities: async () =>
        new Map([
          [
            destinationFactKey(ref, DestinationFactType.OPENING_HOURS),
            {
              status: 'VERIFIED',
              stale: false,
              value: {
                weekly: [{ day: 'MONDAY', intervals: [{ opens: '09:00', closes: '17:00' }] }],
              },
              conflicts: [],
              fact: {
                id: 'hours-1',
                sourceKey: 'trusted-manual-travel-listing',
                sourceTier: DestinationFactSourceTier.TRUSTED_TRAVEL_LISTING,
                confidence: 80,
                retrievedAt: verifiedAt,
                verifiedAt,
              },
            },
          ],
          [
            destinationFactKey(ref, DestinationFactType.TICKET_PRICE),
            {
              status: 'VERIFIED',
              stale: false,
              value: [{ amount: 0, currency: 'MYR', priceType: 'FREE', audience: 'GENERAL' }],
              conflicts: [],
              fact: {
                id: 'price-1',
                sourceKey: 'trusted-manual-travel-listing',
                sourceTier: DestinationFactSourceTier.TRUSTED_TRAVEL_LISTING,
                confidence: 80,
                retrievedAt: verifiedAt,
                verifiedAt,
                status: DestinationFactStatus.ACTIVE,
              },
            },
          ],
        ]),
    }
    const service = new DestinationRetrievalService(db as never, factService as never)

    const result = await service.retrieve({ cityId: 'city-1' })

    expect(result.candidates[0]).toMatchObject({
      openingHoursKnown: true,
      openingHoursStatus: 'VERIFIED',
      ticketPriceStatus: 'VERIFIED',
      priceConfidence: 'KNOWN_PRICE',
      staleFactCount: 0,
    })
    expect(result.candidates[0].rankReasons).toEqual(
      expect.arrayContaining(['opening_hours_verified', 'ticket_price_verified'])
    )
  })
})
