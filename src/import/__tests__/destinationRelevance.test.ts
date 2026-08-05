import { DestinationImportSource } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { normalizeAndDedupe } from '@/import/normalizeDestinationRecords'
import { MediaWikiParser } from '@/import/parsers/mediaWikiParser'
import { evaluateDestinationRecords } from '@/import/relevance'
import type { ImportSourceConfig, NormalizedDestinationRecord, RawDestinationRecord } from '@/import/types'

const klConfig: ImportSourceConfig = {
  source: DestinationImportSource.WIKIVOYAGE,
  sourceKey: 'test-kl',
  url: 'https://en.wikivoyage.org/w/api.php',
  countryName: 'Malaysia',
  countrySlug: 'malaysia',
  countryCode: 'MY',
  cityName: 'Kuala Lumpur',
  citySlug: 'kuala-lumpur',
  defaultKind: 'ATTRACTION',
}

function normalized(overrides: Partial<NormalizedDestinationRecord>): NormalizedDestinationRecord {
  return {
    source: DestinationImportSource.OPENSTREETMAP,
    sourceId: 'source-1',
    kind: 'ATTRACTION',
    name: 'Central Market',
    slug: 'central-market',
    latitude: 3.145,
    longitude: 101.695,
    cityName: 'Kuala Lumpur',
    citySlug: 'kuala-lumpur',
    countryName: 'Malaysia',
    countrySlug: 'malaysia',
    countryCode: 'MY',
    cuisines: [],
    amenities: [],
    tags: ['tourism'],
    images: [],
    openingHours: [],
    fingerprint: 'ATTRACTION:kuala-lumpur:central-market:3.1450:101.6950',
    ...overrides,
  }
}

describe('destination relevance scoring', () => {
  it('accepts a real attraction inside Kuala Lumpur', () => {
    const [record] = evaluateDestinationRecords([normalized({})], klConfig)

    expect(record.relevance).toMatchObject({
      status: 'ACCEPT',
      duplicateStatus: 'DISTINCT',
    })
    expect(record.relevance?.relevanceScore).toBeGreaterThanOrEqual(80)
  })

  it('rejects general city and region articles', () => {
    const records = evaluateDestinationRecords(
      [
        normalized({
          source: DestinationImportSource.WIKIVOYAGE,
          sourceId: 'wikivoyage:kuala-lumpur',
          name: 'Kuala Lumpur',
          slug: 'kuala-lumpur',
          description: 'Kuala Lumpur is Malaysia federal capital and largest city.',
          sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
          tags: ['wikivoyage'],
        }),
        normalized({
          source: DestinationImportSource.WIKIVOYAGE,
          sourceId: 'wikivoyage:malaysia',
          name: 'Malaysia',
          slug: 'malaysia',
          description: 'Malaysia is a country in Southeast Asia.',
          latitude: 3,
          longitude: 108,
          sourceUrl: 'https://en.wikivoyage.org/wiki/Malaysia',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Malaysia',
          tags: ['wikivoyage'],
        }),
      ],
      klConfig
    )

    expect(records[0].relevance).toMatchObject({
      status: 'REJECT',
      rejectionReasons: expect.arrayContaining(['CITY_GUIDE']),
    })
    expect(records[1].relevance).toMatchObject({
      status: 'REJECT',
      rejectionReasons: expect.arrayContaining(['REGION_PAGE']),
    })
  })

  it('rejects records outside the configured city review radius', () => {
    const [record] = evaluateDestinationRecords(
      [
        normalized({
          name: 'Jerantut',
          slug: 'jerantut',
          latitude: 3.9333,
          longitude: 102.3667,
        }),
      ],
      klConfig
    )

    expect(record.relevance).toMatchObject({
      status: 'REJECT',
      rejectionReasons: expect.arrayContaining(['OUTSIDE_REQUESTED_CITY']),
    })
  })

  it('marks borderline distance records for review', () => {
    const [record] = evaluateDestinationRecords(
      [
        normalized({
          name: 'Borderline Theme Park',
          slug: 'borderline-theme-park',
          latitude: 3.1394,
          longitude: 102.0,
        }),
      ],
      klConfig
    )

    expect(record.relevance).toMatchObject({
      status: 'REVIEW',
      rejectionReasons: expect.arrayContaining(['BORDERLINE_CITY_DISTANCE']),
    })
  })

  it('records missing coordinate rejections during normalization', () => {
    const result = normalizeAndDedupe([
      {
        source: DestinationImportSource.OPENSTREETMAP,
        sourceId: 'missing-coordinate',
        name: 'Coordinate Free Place',
        kind: 'ATTRACTION',
        cityName: 'Kuala Lumpur',
      },
    ])

    expect(result.records).toHaveLength(0)
    expect(result.rejections[0]).toMatchObject({
      rejectionReasons: expect.arrayContaining(['MISSING_COORDINATES']),
    })
  })

  it('detects exact and possible duplicate candidates', () => {
    const records = evaluateDestinationRecords(
      [
        normalized({ sourceId: 'one', slug: 'central-market' }),
        normalized({ sourceId: 'one', slug: 'central-market' }),
        normalized({
          sourceId: 'two',
          name: 'Pasar Seni Central Market',
          slug: 'pasar-seni-central-market',
          latitude: 3.1451,
          longitude: 101.6951,
        }),
      ],
      klConfig
    )

    expect(records[1].relevance).toMatchObject({
      status: 'REJECT',
      duplicateStatus: 'EXACT_DUPLICATE',
    })
    expect(records[2].relevance).toMatchObject({
      status: 'REVIEW',
      duplicateStatus: 'POSSIBLE_DUPLICATE',
    })
  })
})

describe('Wikivoyage listing extraction', () => {
  it('maps structured see, do, eat, and sleep listings to project entities', () => {
    const payload = JSON.stringify({
      query: {
        pages: {
          1: {
            title: 'Kuala Lumpur',
            revisions: [
              {
                slots: {
                  main: {
                    '*': [
                      '{{see|name=Central Market|lat=3.145|long=101.695|url=https://example.com|content=Historic market hall.}}',
                      '{{do|name=KL Forest Eco Park|lat=3.152|long=101.704|content=Canopy walk.}}',
                      '{{eat|name=Jalan Alor Stall|lat=3.146|long=101.709|content=Street food.}}',
                      '{{sleep|name=KL Heritage Hotel|lat=3.149|long=101.707|content=Hotel in the city centre.}}',
                    ].join('\\n'),
                  },
                },
              },
            ],
          },
        },
      },
    })

    const records: RawDestinationRecord[] = new MediaWikiParser().parse(payload, klConfig)

    expect(records.map((record) => record.kind)).toEqual([
      'ATTRACTION',
      'ACTIVITY',
      'RESTAURANT',
      'HOTEL',
    ])
    expect(records.every((record) => record.tags?.includes('wikivoyage:listing'))).toBe(true)
    expect(records[0]).toMatchObject({
      sourceUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
      websiteUrl: 'https://example.com',
    })
  })
})
