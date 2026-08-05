import { DestinationImportSource } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  classifyLegacyCleanupRecord,
  readWikivoyageArticleSlug,
} from '@/services/destinations/legacyCleanup'
import type { DestinationCleanupRecord } from '@/services/destinations/types'

function cleanupRecord(overrides: Partial<DestinationCleanupRecord>): DestinationCleanupRecord {
  return {
    id: 'legacy-1',
    name: 'Kuala Lumpur',
    slug: 'kuala-lumpur',
    entityType: 'ATTRACTION',
    entityTable: 'attractions',
    source: DestinationImportSource.WIKIVOYAGE,
    sourceUrlOrIdentifier: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
    cityId: 'city-1',
    cityName: 'Kuala Lumpur',
    citySlug: 'kuala-lumpur',
    countryName: 'Malaysia',
    countrySlug: 'malaysia',
    latitude: 3.1394,
    longitude: 101.6893,
    description: 'Kuala Lumpur is a city in Malaysia.',
    enrichmentId: null,
    referencedByTripsOrItineraries: [],
    ...overrides,
  }
}

describe('destination legacy cleanup classification', () => {
  it('reads Wikivoyage article slugs from encoded source URLs', () => {
    expect(readWikivoyageArticleSlug('https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FEast')).toBe(
      'kuala-lumpur-east'
    )
  })

  it('quarantines old Wikivoyage article-page entities', () => {
    const decision = classifyLegacyCleanupRecord(cleanupRecord({}), {
      source: DestinationImportSource.WIKIVOYAGE,
      city: 'Kuala Lumpur',
      citySlug: 'kuala-lumpur',
      countrySlug: 'malaysia',
      cityCenter: { latitude: 3.1394, longitude: 101.6893 },
    })

    expect(decision.recommendedAction).toBe('QUARANTINE')
    expect(decision.safeToApply).toBe(true)
    expect(decision.reasons).toContain('WIKIVOYAGE_ARTICLE_PAGE_ENTITY')
    expect(decision.reasons).toContain('CITY_GUIDE')
  })

  it('retains current listing-derived Wikivoyage records', () => {
    const decision = classifyLegacyCleanupRecord(
      cleanupRecord({
        id: 'current-1',
        name: 'National Mosque',
        slug: 'national-mosque',
        sourceUrlOrIdentifier: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur%2FBotanical_Garden',
        description: 'A major mosque near the botanical gardens.',
      }),
      {
        source: DestinationImportSource.WIKIVOYAGE,
        city: 'Kuala Lumpur',
        citySlug: 'kuala-lumpur',
        countrySlug: 'malaysia',
        cityCenter: { latitude: 3.1394, longitude: 101.6893 },
      }
    )

    expect(decision.recommendedAction).toBe('RETAIN')
    expect(decision.reasons).toContain('Does not match legacy broad guide-page criteria')
  })

  it('does not apply quarantine to already archived records', () => {
    const decision = classifyLegacyCleanupRecord(cleanupRecord({ deletedAt: new Date('2026-08-04') }), {
      source: DestinationImportSource.WIKIVOYAGE,
      city: 'Kuala Lumpur',
      citySlug: 'kuala-lumpur',
      countrySlug: 'malaysia',
    })

    expect(decision.recommendedAction).toBe('RETAIN')
    expect(decision.safeToApply).toBe(false)
    expect(decision.reasons).toEqual(['Already quarantined'])
  })
})
