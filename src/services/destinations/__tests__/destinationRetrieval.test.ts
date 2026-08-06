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
  applyCandidateDiversityControls,
  filterEligibleDestinationCandidates,
  rankDestinationCandidates,
} from '@/services/destinations/destinationRetrievalService'
import { destinationFactKey } from '@/services/destinations/facts/destinationFactService'
import {
  buildGeminiDestinationContext,
  compactDestinationContextForPrompt,
} from '@/services/destinations/geminiContext'
import {
  buildNearestNeighbors,
  groupNearbyCandidates,
  haversineDistanceKm,
} from '@/services/destinations/geo'
import {
  retrievalCategoriesForDestination,
  selectDestinationDisplayName,
} from '@/services/destinations/retrievalTaxonomy'
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
  it('maps imported attraction categories into retrieval taxonomy without collapsing to museum', () => {
    expect(retrievalCategoriesForDestination({ sourceCategories: ['place-of-worship'] })).toEqual([
      'religious',
      'culture',
      'history',
    ])
    expect(
      retrievalCategoriesForDestination({ sourceCategories: ['market', 'marketplace'] })
    ).toEqual(['market', 'food', 'shopping', 'culture'])
    expect(retrievalCategoriesForDestination({ sourceCategories: ['aquarium'] })).toEqual([
      'family',
      'entertainment',
    ])
    expect(retrievalCategoriesForDestination({ sourceCategories: ['viewpoint'] })).toEqual([
      'viewpoint',
      'nature',
    ])
    expect(retrievalCategoriesForDestination({ sourceCategories: ['night_market'] })).toEqual([
      'night_market',
      'market',
      'food',
      'shopping',
      'culture',
      'entertainment',
    ])
    expect(retrievalCategoriesForDestination({ sourceCategories: ['cable_car'] })).toEqual([
      'cable_car',
      'island',
      'family',
      'entertainment',
      'viewpoint',
    ])
    expect(retrievalCategoriesForDestination({ sourceCategories: ['safari'] })).toEqual([
      'safari',
      'family',
      'nature',
      'entertainment',
    ])
  })

  it('selects non-destructive display names with English and local fallbacks', () => {
    expect(
      selectDestinationDisplayName({
        primaryName: 'วัดหลักสี่',
        localName: 'วัดหลักสี่',
        verifiedEnglishName: 'Laksi Temple',
      })
    ).toMatchObject({ displayName: 'Laksi Temple', displayNameSource: 'verifiedEnglishName' })
    expect(
      selectDestinationDisplayName({
        primaryName: 'วัดหลักสี่',
        localName: 'วัดหลักสี่',
      })
    ).toMatchObject({ displayName: 'วัดหลักสี่', displayNameSource: 'primaryName' })
    expect(
      selectDestinationDisplayName({
        primaryName: 'Sea Life Bangkok',
        localName: null,
        osmEnglishName: 'Sea Life Bangkok',
      })
    ).toMatchObject({ displayName: 'Sea Life Bangkok', displayNameSource: 'osmEnglishName' })
    expect(
      selectDestinationDisplayName({
        primaryName: 'Madame Tussauds Bangkok',
        localName: 'Madame Tussauds Bangkok',
        osmEnglishName: '',
      })
    ).toMatchObject({ displayName: 'Madame Tussauds Bangkok', displayNameSource: 'primaryName' })
    expect(
      selectDestinationDisplayName({
        primaryName: 'Official Primary',
        localName: 'Official Primary',
        osmEnglishName: null,
      })
    ).toMatchObject({ displayName: 'Official Primary', englishName: null })
  })

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

  it('scores explicit preference mappings from structured categories and tags', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'ATTRACTION:market',
          id: 'market',
          name: 'Central Market',
          tags: ['heritage', 'shopping', 'landmark'],
          categories: ['market'],
        }),
        candidate({
          candidateId: 'RESTAURANT:plain',
          id: 'plain',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Plain Cafe',
          tags: ['cafe'],
          categories: [],
          description: 'A simple cafe.',
        }),
      ],
      { cityId: 'city-1', interests: ['Sightseeing', 'Shopping', 'Photography'] }
    )

    expect(rankedCandidates[0].candidateId).toBe('ATTRACTION:market')
    expect(rankedCandidates[0].preferenceMatch?.strongMatches).toEqual(
      expect.arrayContaining(['sightseeing', 'shopping', 'photography'])
    )
    expect(rankedCandidates[0].itineraryReadiness?.decision).toBe('ELIGIBLE')
    expect(rankedCandidates[1].penaltiesApplied).toContain('WEAK_PREFERENCE_MATCH')
  })

  it('propagates imported attraction tags and provenance English names into retrieval candidates', async () => {
    const updatedAt = new Date('2026-08-04T00:00:00.000Z')
    const city = {
      id: 'city-1',
      name: 'Bangkok',
      slug: 'bangkok',
      latitude: 13.75,
      longitude: 100.5,
      country: { name: 'Thailand', slug: 'thailand', currencyCode: 'THB' },
    }
    const db = {
      attraction: {
        findMany: async () => [
          {
            id: 'laksi-temple',
            cityId: 'city-1',
            name: 'วัดหลักสี่',
            slug: 'laksi-temple',
            description: null,
            address: null,
            latitude: 13.88,
            longitude: 100.58,
            websiteUrl: 'https://www.openstreetmap.org/node/1',
            phone: null,
            priceLevel: null,
            durationMinutes: null,
            updatedAt,
            city,
            tags: [
              { name: 'place_of_worship', slug: 'place-of-worship' },
              { name: 'place_of_worship', slug: 'place-of-worship' },
            ],
            openingHours: [],
            enrichment: null,
          },
        ],
      },
      destinationSourceProvenance: {
        findMany: async () => [
          {
            entityId: 'laksi-temple',
            externalIds: { englishName: 'Laksi Temple', englishNameSource: 'osm:name:en' },
          },
        ],
      },
      restaurant: { findMany: async () => [] },
      hotel: { findMany: async () => [] },
      activity: { findMany: async () => [] },
    }
    const factService = { resolveEffectiveFactsForEntities: async () => new Map() }
    const service = new DestinationRetrievalService(db as never, factService as never)

    const result = await service.retrieve({ cityId: 'city-1', interests: ['temples', 'history'] })

    expect(result.candidates[0]).toMatchObject({
      candidateId: 'ATTRACTION:laksi-temple',
      name: 'Laksi Temple',
      primaryName: 'วัดหลักสี่',
      localName: 'วัดหลักสี่',
      englishName: 'Laksi Temple',
      displayNameSource: 'osmEnglishName',
      categories: expect.arrayContaining(['religious', 'culture', 'history']),
      sourceCategories: expect.arrayContaining(['place-of-worship']),
    })
    expect(result.candidates[0].preferenceMatch?.strongMatches).toEqual(
      expect.arrayContaining(['religious', 'history'])
    )
  })

  it('applies category diversity controls before final candidate selection', () => {
    const rankedCandidates = [
      ranked({
        candidateId: 'ATTRACTION:museum-1',
        id: 'museum-1',
        name: 'Museum 1',
        categories: ['museum'],
        rankScore: 100,
      }),
      ranked({
        candidateId: 'ATTRACTION:museum-2',
        id: 'museum-2',
        name: 'Museum 2',
        categories: ['museum'],
        rankScore: 99,
      }),
      ranked({
        candidateId: 'ATTRACTION:museum-3',
        id: 'museum-3',
        name: 'Museum 3',
        categories: ['museum'],
        rankScore: 98,
      }),
      ranked({
        candidateId: 'ATTRACTION:museum-4',
        id: 'museum-4',
        name: 'Museum 4',
        categories: ['museum'],
        rankScore: 97,
      }),
      ranked({
        candidateId: 'ATTRACTION:market',
        id: 'market',
        name: 'Market',
        categories: ['market'],
        rankScore: 82,
      }),
      ranked({
        candidateId: 'ATTRACTION:aquarium',
        id: 'aquarium',
        name: 'Aquarium',
        categories: ['family'],
        rankScore: 80,
      }),
      ranked({
        candidateId: 'ATTRACTION:landmark',
        id: 'landmark',
        name: 'Landmark',
        categories: ['landmark'],
        rankScore: 78,
      }),
    ]

    const selected = applyCandidateDiversityControls(rankedCandidates, {
      cityId: 'city-1',
      limitPerType: 6,
    })
    const categoryCounts = selected.reduce<Record<string, number>>((counts, item) => {
      const category = item.categories[0] ?? 'unknown'
      counts[category] = (counts[category] ?? 0) + 1
      return counts
    }, {})

    expect(selected).toHaveLength(6)
    expect(categoryCounts.museum).toBeLessThanOrEqual(3)
    expect(Object.keys(categoryCounts)).toEqual(
      expect.arrayContaining(['museum', 'market', 'family'])
    )
    expect(selected[0].candidateId).toBe('ATTRACTION:museum-1')
  })

  it('marks generic sports activities ineligible when Sports is not selected', () => {
    const [rankedCandidate] = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'ACTIVITY:badminton',
          id: 'badminton',
          entityType: 'ACTIVITY',
          entityTable: 'activities',
          name: 'Badminton',
          slug: 'badminton',
          description: null,
          source: DestinationImportSource.WIKIVOYAGE,
          sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FEast',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FEast',
          tags: ['wikivoyage-do'],
          categories: ['do'],
        }),
      ],
      { cityId: 'city-1', interests: ['Sightseeing', 'Nightlife', 'Shopping', 'Photography'] }
    )

    expect(rankedCandidate.itineraryReadiness?.decision).toBe('INELIGIBLE')
    expect(rankedCandidate.penaltiesApplied).toEqual(
      expect.arrayContaining(['GENERIC_ACTIVITY', 'WEAK_PREFERENCE_MATCH'])
    )
  })

  it('penalizes active recreation when only incidental preference words match', () => {
    const [rankedCandidate] = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'ACTIVITY:cycle-hike',
          id: 'cycle-hike',
          entityType: 'ACTIVITY',
          entityTable: 'activities',
          name: 'Cycle or hike on SWBC',
          slug: 'cycle-or-hike-on-swbc',
          description: 'Walk or cycle on the bike lane towards a shopping mall.',
          source: DestinationImportSource.WIKIVOYAGE,
          sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FBrickfields_and_Bangsar',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FBrickfields_and_Bangsar',
          tags: ['wikivoyage-do'],
          categories: ['do'],
        }),
      ],
      { cityId: 'city-1', interests: ['Shopping', 'Photography'] }
    )

    expect(rankedCandidate.preferenceMatch?.partialMatches).toContain('shopping')
    expect(rankedCandidate.penaltiesApplied).toContain('CLEAR_PREFERENCE_MISMATCH')
    expect(rankedCandidate.itineraryReadiness?.decision).not.toBe('ELIGIBLE')
  })

  it('downranks chain restaurants when local food alternatives exist', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'RESTAURANT:mcdonalds',
          id: 'mcdonalds',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: "McDonald's",
          slug: 'mcdonalds',
          tags: ['fast-food'],
          categories: ['burger'],
          sourceUrl: 'https://www.mcdonalds.com.my/',
          websiteUrl: 'https://www.mcdonalds.com.my/',
        }),
        candidate({
          candidateId: 'RESTAURANT:local',
          id: 'local',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Nasi Kandar Heritage',
          slug: 'nasi-kandar-heritage',
          tags: ['malaysian', 'restaurant'],
          categories: ['mamak'],
          description: 'Local Malaysian food near the heritage district.',
        }),
      ],
      { cityId: 'city-1', interests: ['local', 'halal'] }
    )

    expect(rankedCandidates[0].candidateId).toBe('RESTAURANT:local')
    expect(
      rankedCandidates.find((item) => item.candidateId === 'RESTAURANT:mcdonalds')?.penaltiesApplied
    ).toContain('CHAIN_BRAND_LOW_PRIORITY')
  })

  it('penalizes locality-name mismatches without rejecting proven local branches outright', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'RESTAURANT:weak-muar',
          id: 'weak-muar',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Mee Bandung House (Muar)',
          slug: 'mee-bandung-house-muar',
          address: '4 Jalan Pahang Barat, 53000',
          websiteUrl: null,
          sourceUrl: null,
          tags: ['malaysian', 'restaurant'],
          categories: ['malaysian'],
        }),
        candidate({
          candidateId: 'RESTAURANT:branch-muar',
          id: 'branch-muar',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Mee Bandung House (Muar)',
          slug: 'mee-bandung-house-muar-branch',
          address: '4 Jalan Pahang Barat, Kuala Lumpur, 53000',
          websiteUrl: 'https://example.com/mee-bandung-kl',
          sourceUrl: 'https://example.com/mee-bandung-kl',
          tags: ['malaysian', 'restaurant'],
          categories: ['malaysian'],
        }),
      ],
      { cityId: 'city-1', interests: ['local'] }
    )

    const weak = rankedCandidates.find((item) => item.candidateId === 'RESTAURANT:weak-muar')
    const branch = rankedCandidates.find((item) => item.candidateId === 'RESTAURANT:branch-muar')

    expect(weak?.penaltiesApplied).toEqual(
      expect.arrayContaining(['LOCALITY_NAME_MISMATCH', 'MISSING_SOURCE_URL'])
    )
    expect(weak?.itineraryReadiness?.decision).not.toBe('ELIGIBLE')
    expect(branch?.penaltiesApplied).toContain('LOCALITY_NAME_MISMATCH')
    expect(branch?.itineraryReadiness?.decision).not.toBe('INELIGIBLE')
  })

  it('distinguishes same-brand different branches from nearby duplicate records', () => {
    const rankedCandidates = rankDestinationCandidates(
      [
        candidate({
          candidateId: 'RESTAURANT:branch-a',
          id: 'branch-a',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Old Town',
          slug: 'old-town-a',
          latitude: 3.13,
          longitude: 101.68,
          tags: ['cafe'],
        }),
        candidate({
          candidateId: 'RESTAURANT:branch-b',
          id: 'branch-b',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'Old Town',
          slug: 'old-town-b',
          latitude: 3.2,
          longitude: 101.74,
          tags: ['cafe'],
        }),
        candidate({
          candidateId: 'RESTAURANT:nearby',
          id: 'nearby',
          entityType: 'RESTAURANT',
          entityTable: 'restaurants',
          name: 'ZZ Nearby Cafe',
          slug: 'zz-nearby-cafe',
          latitude: 3.1301,
          longitude: 101.6801,
          tags: ['cafe'],
          sourceUrl: null,
          websiteUrl: null,
          officialUrl: undefined,
        }),
      ],
      { cityId: 'city-1', interests: ['food'] }
    )

    expect(
      rankedCandidates.find((item) => item.candidateId === 'RESTAURANT:branch-b')?.duplicateStatus
    ).toBe('SAME_BRAND_DIFFERENT_BRANCH')
    expect(
      rankedCandidates.find((item) => item.candidateId === 'RESTAURANT:nearby')?.duplicateStatus
    ).toBe('POSSIBLE_DUPLICATE')
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
    expect(
      neighbors.find((entry) => entry.candidateId === 'ATTRACTION:a')?.neighbors[0]
    ).toMatchObject({
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
      factualCompletenessScore: 80,
      staleFactCount: 0,
    })
    const promptContext = compactDestinationContextForPrompt(context)
    expect(JSON.stringify(promptContext)).not.toContain('lastVerifiedAt')
    expect(JSON.stringify(promptContext)).not.toContain('rankReasons')
    expect(promptContext.candidates[0]).toMatchObject({
      candidateId: 'ATTRACTION:a',
      entityType: 'ATTRACTION',
      openingHoursStatus: 'UNKNOWN',
      priceStatus: 'UNKNOWN',
    })
  })

  it('seeds compact Gemini context with attraction, restaurant, and activity candidates when available', () => {
    const retrieval: DestinationRetrievalResult = {
      cityId: 'city-1',
      candidates: [
        ranked({
          candidateId: 'ATTRACTION:a',
          id: 'a',
          entityType: 'ATTRACTION',
          name: 'A',
          rankScore: 100,
        }),
        ranked({
          candidateId: 'ATTRACTION:b',
          id: 'b',
          entityType: 'ATTRACTION',
          name: 'B',
          rankScore: 99,
        }),
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

  it('excludes REVIEW and INELIGIBLE candidates from retrieval results', async () => {
    const updatedAt = new Date('2026-08-04T00:00:00.000Z')
    const city = {
      id: 'city-1',
      name: 'Kuala Lumpur',
      slug: 'kuala-lumpur',
      latitude: 3.1394,
      longitude: 101.6893,
      country: { name: 'Malaysia', slug: 'malaysia', currencyCode: 'MYR' },
    }
    const db = {
      attraction: {
        findMany: async () => [
          {
            id: 'central-market',
            cityId: 'city-1',
            name: 'Central Market',
            slug: 'central-market',
            description: 'A heritage market for sightseeing, shopping, and photography.',
            address: 'Kuala Lumpur',
            latitude: 3.145,
            longitude: 101.695,
            websiteUrl: 'https://example.com/central-market',
            phone: null,
            priceLevel: null,
            durationMinutes: 90,
            updatedAt,
            city,
            tags: [
              { name: 'heritage', slug: 'heritage' },
              { name: 'shopping', slug: 'shopping' },
            ],
            openingHours: [],
            enrichment: null,
          },
        ],
      },
      restaurant: { findMany: async () => [] },
      hotel: { findMany: async () => [] },
      activity: {
        findMany: async () => [
          {
            id: 'badminton',
            cityId: 'city-1',
            name: 'Badminton',
            slug: 'badminton',
            description: null,
            category: 'do',
            address: null,
            latitude: 3.119444,
            longitude: 101.7275,
            websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FEast',
            phone: null,
            priceLevel: null,
            durationMinutes: null,
            updatedAt,
            city,
            tags: [{ name: 'wikivoyage-do', slug: 'wikivoyage-do' }],
            openingHours: [],
            enrichment: null,
          },
        ],
      },
    }
    const factService = { resolveEffectiveFactsForEntities: async () => new Map() }
    const service = new DestinationRetrievalService(db as never, factService as never)

    const result = await service.retrieve({
      cityId: 'city-1',
      interests: ['Sightseeing', 'Nightlife', 'Shopping', 'Photography'],
    })

    expect(result.candidates.map((item) => item.candidateId)).toEqual(['ATTRACTION:central-market'])
    expect(result.candidates[0].itineraryReadiness?.decision).toBe('ELIGIBLE')
  })
})
