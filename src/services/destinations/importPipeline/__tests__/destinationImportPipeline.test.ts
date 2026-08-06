import { DestinationFactEntityType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { evaluateDuplicateCandidate } from '@/services/destinations/importPipeline/deduplication'
import {
  ASEAN_PILOT_AREA_SLUGS,
  listDestinationImportAreas,
  resolveDestinationImportArea,
} from '@/services/destinations/importPipeline/destinationAreas'
import { DestinationImportPipelineService } from '@/services/destinations/importPipeline/destinationImportPipelineService'
import { DestinationImportHttpClient } from '@/services/destinations/importPipeline/httpClient'
import {
  imageSourceRecordId,
  planAttractionImportMerge,
  planImageAttributionMerge,
} from '@/services/destinations/importPipeline/mergeProtection'
import {
  buildOpenStreetMapAttractionQuery,
  OpenStreetMapAttractionProvider,
} from '@/services/destinations/importPipeline/providers/openStreetMapProvider'
import { WikimediaCommonsProvider } from '@/services/destinations/importPipeline/providers/wikimediaCommonsProvider'
import type { NormalizedDestinationCandidate } from '@/services/destinations/importPipeline/types'
import {
  categoryFromOsmTags,
  normalizeCandidateName,
  normalizeNameIdentityKeys,
} from '@/services/destinations/importPipeline/utils'
import { validateImportCandidate } from '@/services/destinations/importPipeline/validation'
import {
  assertDestinationSourceUsable,
  DestinationSourceRegistryError,
  getDestinationSourceDefinition,
} from '@/services/destinations/sources/sourceRegistry'

function bangkok() {
  const area = resolveDestinationImportArea('bangkok')
  if (!area) throw new Error('Bangkok area missing')
  return area
}

function candidate(overrides: Partial<NormalizedDestinationCandidate> = {}): NormalizedDestinationCandidate {
  const area = bangkok()
  const name = overrides.name ?? 'Grand Palace'
  const names = overrides.names ?? {
    primary: name,
    local: null,
    english: name,
    aliases: [],
    languages: { en: name },
  }
  return {
    sourceId: 'openstreetmap-overpass',
    sourceRecordId: 'osm:node:1',
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    sourceObjectType: 'node',
    name,
    names,
    normalizedName: overrides.normalizedName ?? normalizeCandidateName(name),
    aliases: overrides.aliases ?? normalizeNameIdentityKeys([names.local, names.english, ...names.aliases]),
    nameIdentityKeys: overrides.nameIdentityKeys ?? normalizeNameIdentityKeys([
      name,
      names.local,
      names.english,
      ...names.aliases,
      ...Object.values(names.languages),
    ]),
    countryCode: area.countryCode,
    countryName: area.countryName,
    countrySlug: area.countrySlug,
    destinationSlug: area.slug,
    locality: 'Bangkok',
    administrativeArea: null,
    latitude: 13.75,
    longitude: 100.4913,
    category: 'historic',
    subcategories: ['historic'],
    rawTags: { historic: 'palace', name: 'Grand Palace', wikidata: 'Q209825' },
    shortDescription: null,
    websiteUrl: null,
    phoneNumber: null,
    openingHoursRaw: null,
    wikidataId: 'Q209825',
    wikipediaUrl: null,
    commonsCategory: null,
    englishNameSource: names.english ? 'osm:name:en' : null,
    imageUrl: null,
    imagePageUrl: null,
    imageAuthor: null,
    imageLicense: null,
    imageLicenseUrl: null,
    imageAttribution: null,
    contentLicense: 'Open Database License 1.0',
    contentAttribution: 'OpenStreetMap contributors',
    discoveredAt: new Date('2026-08-06T00:00:00.000Z'),
    sourceUpdatedAt: null,
    rawSourcePayload: { id: 1 },
    ...overrides,
  }
}

describe('ASEAN destination source registry and areas', () => {
  it('allows registered API/open-data sources and rejects disabled/unlicensed sources', () => {
    expect(assertDestinationSourceUsable('openstreetmap-overpass').licenseName).toContain('Open Database')
    expect(getDestinationSourceDefinition('official-tourism-html')?.enabled).toBe(false)
    expect(() => assertDestinationSourceUsable('official-tourism-html')).toThrow(DestinationSourceRegistryError)
    expect(() => assertDestinationSourceUsable('government-tourism-open-data')).toThrow(DestinationSourceRegistryError)
  })

  it('contains all requested areas and exposes the conservative pilot set', () => {
    expect(listDestinationImportAreas()).toHaveLength(36)
    expect(listDestinationImportAreas({ pilotsOnly: true }).map((area) => area.slug)).toEqual([
      ...ASEAN_PILOT_AREA_SLUGS,
    ])
    expect(resolveDestinationImportArea('Krung Thep Maha Nakhon')?.slug).toBe('bangkok')
  })
})

describe('OpenStreetMap discovery and normalization', () => {
  it('builds an attraction-focused query that excludes restaurants and hotels', () => {
    const query = buildOpenStreetMapAttractionQuery(bangkok(), 20)
    expect(query).toContain('tourism')
    expect(query).toContain('historic')
    expect(query).toContain('place_of_worship')
    expect(query).not.toContain('restaurant')
    expect(query).not.toContain('hotel')
  })

  it('normalizes only supported named OSM tourism records', async () => {
    const payload = {
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 13.75,
          lon: 100.49,
          tags: { name: 'Grand Palace', historic: 'palace', wikidata: 'Q209825' },
        },
        {
          type: 'node',
          id: 2,
          lat: 13.75,
          lon: 100.5,
          tags: { name: 'KFC', amenity: 'fast_food' },
        },
      ],
    }
    const httpClient = new DestinationImportHttpClient({
      disableRateLimit: true,
      disableCache: true,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    })
    const records = await new OpenStreetMapAttractionProvider(httpClient).discover({
      area: bangkok(),
      limit: 10,
      httpClient,
    })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      name: 'Grand Palace',
      category: 'historic',
      sourceObjectType: 'node',
      sourceRecordId: 'osm:node:1',
      wikidataId: 'Q209825',
    })
  })

  it('preserves local primary names and stores English names separately', async () => {
    const localName = '\u0e27\u0e31\u0e14\u0e41\u0e01\u0e49\u0e27'
    const officialName = '\u0e27\u0e31\u0e14\u0e41\u0e01\u0e49\u0e27\u0e1e\u0e34\u0e17\u0e31\u0e01\u0e29\u0e4c'
    const payload = {
      elements: [
        {
          type: 'way',
          id: 9,
          center: { lat: 13.75, lon: 100.49 },
          tags: {
            name: localName,
            'name:en': 'Wat Kaew',
            'name:th': localName,
            alt_name: 'Temple of Glass',
            official_name: officialName,
            short_name: localName,
            tourism: 'museum',
          },
        },
      ],
    }
    const httpClient = new DestinationImportHttpClient({
      disableRateLimit: true,
      disableCache: true,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    })

    const records = await new OpenStreetMapAttractionProvider(httpClient).discover({
      area: bangkok(),
      limit: 10,
      httpClient,
    })

    expect(records[0]).toMatchObject({
      name: localName,
      names: {
        primary: localName,
        local: localName,
        english: 'Wat Kaew',
      },
      englishNameSource: 'osm:name:en',
      sourceRecordId: 'osm:way:9',
    })
    expect(records[0].names.aliases).toEqual(expect.arrayContaining(['Wat Kaew', 'Temple of Glass', officialName]))
    expect(records[0].nameIdentityKeys).toEqual(expect.arrayContaining(['wat kaew', localName]))
  })

  it('keeps local-name-only cultural records eligible for validation', async () => {
    const localMuseum = '\u0e1e\u0e34\u0e1e\u0e34\u0e18\u0e20\u0e31\u0e13\u0e11\u0e4c\u0e17\u0e49\u0e2d\u0e07\u0e16\u0e34\u0e48\u0e19'
    const payload = {
      elements: [
        {
          type: 'node',
          id: 10,
          lat: 13.75,
          lon: 100.49,
          tags: { name: localMuseum, tourism: 'museum' },
        },
      ],
    }
    const httpClient = new DestinationImportHttpClient({
      disableRateLimit: true,
      disableCache: true,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    })

    const [record] = await new OpenStreetMapAttractionProvider(httpClient).discover({
      area: bangkok(),
      limit: 10,
      httpClient,
    })
    const result = validateImportCandidate(record, bangkok())

    expect(record.names.english).toBeNull()
    expect(record.englishNameSource).toBeNull()
    expect(record.normalizedName).toBe('')
    expect(result.status).toBe('accepted')
    expect(result.reasons).not.toContain('LOW_IDENTITY_SIGNAL')
  })
})

describe('import validation and deduplication', () => {
  it('rejects out-of-bound coordinates and generic names', () => {
    const result = validateImportCandidate(
      candidate({
        name: 'Museum',
        normalizedName: 'museum',
        latitude: 14.7,
        longitude: 101.8,
      }),
      bangkok()
    )
    expect(result.status).toBe('rejected')
    expect(result.reasons).toEqual(expect.arrayContaining(['OUT_OF_BOUNDS', 'GENERIC_NAME']))
  })

  it('rejects chain or generic businesses only with supporting business signals', () => {
    const result = validateImportCandidate(
      candidate({
        name: 'McDonalds Bangkok',
        normalizedName: 'mcdonalds bangkok',
        category: 'landmark',
        rawTags: { amenity: 'fast_food', name: 'McDonalds Bangkok' },
        wikidataId: null,
      }),
      bangkok()
    )
    expect(result.status).toBe('rejected')
    expect(result.reasons).toContain('CHAIN_OR_GENERIC_BUSINESS')
  })

  it('does not reject a cultural venue just because its name contains an organization word', () => {
    const result = validateImportCandidate(
      candidate({
        sourceRecordId: 'osm:node:891253823',
        name: 'Office of Agricultural Museum and Culture',
        normalizedName: 'office of agricultural museum and culture',
        category: 'museum',
        subcategories: ['museum'],
        rawTags: {
          name: '\u0e2a\u0e33\u0e19\u0e31\u0e01\u0e1e\u0e34\u0e1e\u0e34\u0e18\u0e20\u0e31\u0e13\u0e11\u0e4c\u0e41\u0e25\u0e30\u0e27\u0e31\u0e12\u0e19\u0e18\u0e23\u0e23\u0e21\u0e01\u0e32\u0e23\u0e40\u0e01\u0e29\u0e15\u0e23',
          'name:en': 'Office of Agricultural Museum and Culture',
          tourism: 'museum',
        },
        wikidataId: null,
      }),
      bangkok()
    )

    expect(result.status).toBe('accepted')
    expect(result.reasons).not.toContain('CHAIN_OR_GENERIC_BUSINESS')
  })

  it('rejects transport-only objects even when OSM also tags them as attractions', () => {
    const result = validateImportCandidate(
      candidate({
        name: 'Phanfa Leelard',
        normalizedName: 'phanfa leelard',
        category: 'landmark',
        rawTags: { tourism: 'attraction', amenity: 'ferry_terminal', public_transport: 'stop_position' },
        wikidataId: null,
      }),
      bangkok()
    )
    expect(result.status).toBe('rejected')
    expect(result.reasons).toContain('TRANSPORT_ONLY')
  })

  it('rejects normal bus stops and ferry piers without independent attraction identity', () => {
    const busStop = validateImportCandidate(
      candidate({
        name: 'Central Bus Stop',
        normalizedName: 'central bus stop',
        category: 'landmark',
        rawTags: { public_transport: 'stop_position', name: 'Central Bus Stop' },
        wikidataId: null,
      }),
      bangkok()
    )
    const ferryPier = validateImportCandidate(
      candidate({
        name: 'River Pier',
        normalizedName: 'river pier',
        category: 'landmark',
        rawTags: { amenity: 'ferry_terminal', ferry: 'yes', name: 'River Pier' },
        wikidataId: null,
      }),
      bangkok()
    )

    expect(busStop.reasons).toContain('TRANSPORT_ONLY')
    expect(ferryPier.reasons).toContain('TRANSPORT_ONLY')
  })

  it('derives specific categories before falling back to generic tourism attractions', () => {
    expect(categoryFromOsmTags({ tourism: 'attraction', historic: 'monument' })).toBe('historic')
    expect(categoryFromOsmTags({ tourism: 'attraction', amenity: 'place_of_worship' })).toBe('place_of_worship')
    expect(categoryFromOsmTags({ tourism: 'attraction' })).toBe('landmark')
  })

  it('allows historic transport landmarks and rejects subordinate transport entrances', () => {
    const historicStation = validateImportCandidate(
      candidate({
        name: 'Old Central Station',
        normalizedName: 'old central station',
        category: 'historic',
        rawTags: { railway: 'station', historic: 'railway_station', tourism: 'attraction', name: 'Old Central Station' },
        wikidataId: null,
      }),
      bangkok()
    )
    const transportEntrance = validateImportCandidate(
      candidate({
        name: 'Museum Station Entrance',
        normalizedName: 'museum station entrance',
        category: 'landmark',
        rawTags: {
          entrance: 'yes',
          public_transport: 'platform',
          railway: 'subway_entrance',
          tourism: 'attraction',
          name: 'Museum Station Entrance',
        },
        wikidataId: null,
      }),
      bangkok()
    )

    expect(historicStation.reasons).not.toContain('TRANSPORT_ONLY')
    expect(transportEntrance.reasons).toContain('TRANSPORT_ONLY')
  })

  it('classifies exact, probable, possible and conflict duplicates with diagnostics', () => {
    const base = candidate()
    expect(evaluateDuplicateCandidate(base, [base], [])).toMatchObject({
      decision: 'exact_duplicate',
      diagnostic: { matchedFields: ['sourceRecordId'] },
    })
    expect(
      evaluateDuplicateCandidate(candidate({ sourceRecordId: 'osm:node:2' }), [base], [])
    ).toMatchObject({ decision: 'probable_duplicate' })
    expect(
      evaluateDuplicateCandidate(
        candidate({
          name: 'Grand Palace Museum',
          normalizedName: 'grand palace museum',
          aliases: ['grand palace'],
          nameIdentityKeys: ['grand palace museum', 'grand palace'],
          sourceRecordId: 'osm:node:3',
          latitude: 13.7504,
        }),
        [],
        [
          {
            entityType: DestinationFactEntityType.ATTRACTION,
            entityId: 'existing-1',
            name: 'Grand Palace',
            slug: 'grand-palace',
            latitude: 13.7505,
            longitude: 100.4914,
          },
        ]
      )
    ).toMatchObject({ decision: 'probable_duplicate' })
    expect(
      evaluateDuplicateCandidate(
        candidate({ sourceRecordId: 'osm:node:4', latitude: 13.1, longitude: 100.9, wikidataId: null }),
        [base],
        []
      )
    ).toMatchObject({ decision: 'conflict' })
  })

  it('does not treat different local-script names as duplicates when Latin-normalized names are empty', () => {
    const marketName = '\u0e15\u0e25\u0e32\u0e14\u0e17\u0e48\u0e32\u0e17\u0e23\u0e32\u0e22'
    const aquariumName = '\u0e1e\u0e34\u0e1e\u0e34\u0e18\u0e20\u0e31\u0e13\u0e11\u0e4c\u0e2a\u0e31\u0e15\u0e27\u0e4c\u0e19\u0e49\u0e33\u0e1a\u0e32\u0e07\u0e40\u0e02\u0e19'
    expect(
      evaluateDuplicateCandidate(
        candidate({
          name: marketName,
          names: { primary: marketName, local: marketName, english: null, aliases: [], languages: { th: marketName } },
          normalizedName: '',
          nameIdentityKeys: [marketName],
          sourceRecordId: 'osm:node:5',
          latitude: 13.87,
          wikidataId: null,
        }),
        [
          candidate({
            name: aquariumName,
            names: { primary: aquariumName, local: aquariumName, english: null, aliases: [], languages: { th: aquariumName } },
            normalizedName: '',
            nameIdentityKeys: [aquariumName],
            sourceRecordId: 'osm:node:6',
            wikidataId: null,
          }),
        ],
        []
      )
    ).toMatchObject({ decision: 'new' })
  })

  it('detects duplicates across local and English name variants', () => {
    const localName = '\u0e1e\u0e23\u0e30\u0e1a\u0e23\u0e21\u0e21\u0e2b\u0e32\u0e23\u0e32\u0e0a\u0e27\u0e31\u0e07'
    const localCandidate = candidate({
      name: localName,
      names: {
        primary: localName,
        local: localName,
        english: 'Grand Palace',
        aliases: ['Grand Palace'],
        languages: { th: localName, en: 'Grand Palace' },
      },
      normalizedName: '',
      nameIdentityKeys: normalizeNameIdentityKeys([localName, 'Grand Palace']),
      sourceRecordId: 'osm:node:7',
      wikidataId: null,
    })

    expect(evaluateDuplicateCandidate(localCandidate, [candidate({ wikidataId: null })], [])).toMatchObject({
      decision: 'probable_duplicate',
      diagnostic: { matchedFields: ['name', 'coordinates'] },
    })
  })

  it('keeps OSM node, way and relation IDs distinct while still diagnosing likely duplicates', () => {
    const node = candidate({ sourceRecordId: 'osm:node:42', sourceObjectType: 'node' })
    const way = candidate({ sourceRecordId: 'osm:way:42', sourceObjectType: 'way', latitude: 13.7501 })

    expect(evaluateDuplicateCandidate(way, [node], [])).toMatchObject({
      decision: 'probable_duplicate',
      duplicateOf: 'openstreetmap-overpass:osm:node:42',
    })
  })

  it('detects duplicates by Wikidata ID and website', () => {
    expect(
      evaluateDuplicateCandidate(
        candidate({ sourceRecordId: 'osm:way:20', wikidataId: 'Q1' }),
        [candidate({ sourceRecordId: 'osm:node:20', wikidataId: 'Q1', latitude: 13.2 })],
        []
      )
    ).toMatchObject({ decision: 'probable_duplicate', diagnostic: { matchedFields: ['wikidataId'] } })

    expect(
      evaluateDuplicateCandidate(
        candidate({ sourceRecordId: 'osm:way:21', websiteUrl: 'https://example.com' }),
        [],
        [
          {
            entityType: DestinationFactEntityType.ATTRACTION,
            entityId: 'existing-2',
            name: 'Example Palace',
            slug: 'example-palace',
            latitude: 13.75,
            longitude: 100.4913,
            websiteUrl: 'https://example.com',
          },
        ]
      )
    ).toMatchObject({ decision: 'probable_duplicate', diagnostic: { matchedFields: ['websiteUrl'] } })
  })

  it('ignores short numeric aliases when building duplicate identity keys', () => {
    expect(normalizeNameIdentityKeys(['2', '5 6', 'Grand Palace'])).toEqual(['grand palace'])
  })
})

describe('Wikimedia Commons licensing', () => {
  it('accepts reusable Commons images with attribution metadata', async () => {
    const payload = {
      query: {
        pages: {
          1: {
            title: 'File:Grand Palace.jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/grand-palace.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Grand_Palace.jpg',
                extmetadata: {
                  Artist: { value: '<span>Jane Doe</span>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                  Attribution: { value: 'Jane Doe' },
                },
              },
            ],
          },
        },
      },
    }
    const httpClient = new DestinationImportHttpClient({
      disableRateLimit: true,
      disableCache: true,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    })
    await expect(new WikimediaCommonsProvider(httpClient).fetchLicensedImageByFileName('Grand Palace.jpg')).resolves.toMatchObject({
      imageLicense: 'CC BY-SA 4.0',
      imageAuthor: 'Jane Doe',
    })
  })

  it('rejects Commons images without reusable licence metadata', async () => {
    const payload = {
      query: {
        pages: {
          1: {
            title: 'File:Unknown.jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/unknown.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Unknown.jpg',
                extmetadata: {
                  Artist: { value: 'Unknown' },
                  LicenseShortName: { value: 'Non-free' },
                  LicenseUrl: { value: 'https://example.invalid/non-free' },
                },
              },
            ],
          },
        },
      },
    }
    const httpClient = new DestinationImportHttpClient({
      disableRateLimit: true,
      disableCache: true,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    })
    await expect(new WikimediaCommonsProvider(httpClient).fetchLicensedImageByFileName('Unknown.jpg')).resolves.toBeNull()
  })
})

describe('destination import HTTP client', () => {
  it('retries rate-limited provider responses using Retry-After', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const client = new DestinationImportHttpClient({
      fetcher,
      disableRateLimit: true,
      disableCache: true,
      maxRetries: 1,
      baseDelayMs: 1,
    })

    await expect(client.get('wikidata', 'https://www.wikidata.org/wiki/Special:EntityData/Q1.json')).resolves.toMatchObject({
      text: '{"ok":true}',
      fromCache: false,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('manual field protection', () => {
  it('does not replace manual or unknown-owner fields', () => {
    const plan = planAttractionImportMerge(
      {
        name: 'Manual Name',
        description: 'Manual description',
        address: 'Manual locality',
        latitude: 13.1,
        longitude: 100.1,
        websiteUrl: 'https://manual.example',
        phone: '111',
      },
      candidate({
        name: 'Imported Name',
        shortDescription: 'Imported description',
        locality: 'Imported locality',
        latitude: 13.75,
        longitude: 100.49,
        websiteUrl: 'https://imported.example',
        phoneNumber: '222',
      }),
      []
    )

    expect(plan.changedFields).toHaveLength(0)
    expect(plan.protectedFields.map((field) => field.field)).toEqual(
      expect.arrayContaining(['name', 'description', 'address', 'latitude', 'longitude', 'websiteUrl', 'phone'])
    )
  })

  it('lets stronger verified provider data replace weaker provider-managed fields', () => {
    const plan = planAttractionImportMerge(
      {
        name: 'Provider Name',
        description: 'Old provider description',
        address: null,
        latitude: 13.1,
        longitude: 100.1,
        websiteUrl: null,
        phone: null,
      },
      candidate({
        name: 'Verified Provider Name',
        shortDescription: 'Verified description',
        locality: 'Bangkok',
        latitude: 13.75,
        longitude: 100.49,
        websiteUrl: 'https://official.example',
      }),
      [
        {
          sourceProvider: 'openstreetmap-overpass',
          sourceRecordId: 'osm:node:old',
          importConfidence: 50,
          manuallyCurated: false,
        },
      ]
    )

    expect(plan.changedFields.map((field) => field.field)).toEqual(
      expect.arrayContaining(['name', 'description', 'address', 'latitude', 'longitude', 'websiteUrl'])
    )
    expect(plan.protectedFields).toHaveLength(0)
  })

  it('does not erase existing values with null imports and remains idempotent on repeat', () => {
    const existing = {
      name: 'Grand Palace',
      description: 'Existing description',
      address: 'Bangkok',
      latitude: 13.75,
      longitude: 100.4913,
      websiteUrl: null,
      phone: null,
    }
    const nullImport = planAttractionImportMerge(existing, candidate({ shortDescription: null }), [])
    const repeatImport = planAttractionImportMerge(existing, candidate({ shortDescription: 'Existing description' }), [
      {
        sourceProvider: 'openstreetmap-overpass',
        sourceRecordId: 'osm:node:1',
        importConfidence: 95,
        manuallyCurated: false,
      },
    ])

    expect(nullImport.changedFields.map((field) => field.field)).not.toContain('description')
    expect(nullImport.protectedFields.map((field) => field.field)).not.toContain('description')
    expect(repeatImport.changedFields).toHaveLength(0)
    expect(repeatImport.protectedFields).toHaveLength(0)
  })

  it('can complete image attribution metadata without replacing a selected image', () => {
    const imageCandidate = candidate({
      imageUrl: 'https://upload.wikimedia.org/image.jpg',
      imageAttribution: 'Jane Doe',
      imagePageUrl: 'https://commons.wikimedia.org/wiki/File:Image.jpg',
      imageAuthor: 'Jane Doe',
      imageLicense: 'CC BY-SA 4.0',
      imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    })

    expect(
      planImageAttributionMerge(
        {
          url: 'https://upload.wikimedia.org/image.jpg',
          attribution: null,
          sourceProvider: null,
          sourceRecordId: null,
          sourceUrl: null,
          pageUrl: null,
          author: null,
          licenseName: null,
          licenseUrl: null,
        },
        imageCandidate
      )
    ).toMatchObject({ action: 'complete_metadata', protected: false })

    expect(
      planImageAttributionMerge(
        {
          url: 'https://manual.example/manual.jpg',
          attribution: null,
          sourceProvider: null,
          sourceRecordId: null,
          sourceUrl: null,
          pageUrl: null,
          author: null,
          licenseName: null,
          licenseUrl: null,
        },
        imageCandidate
      )
    ).toMatchObject({ action: 'protect_existing_image', protected: true })
  })

  it('uses a bounded source record ID for long Wikimedia Commons page URLs', () => {
    const imageCandidate = candidate({
      imageUrl: 'https://upload.wikimedia.org/example.jpg',
      imageAttribution: 'Jane Doe',
      imagePageUrl: `https://commons.wikimedia.org/wiki/File:${'very-long-file-name-'.repeat(20)}.jpg`,
      imageAuthor: 'Jane Doe',
      imageLicense: 'CC BY-SA 4.0',
      imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    })
    const sourceRecordId = imageSourceRecordId(imageCandidate)

    expect(sourceRecordId).toMatch(/^commons:[a-f0-9]{64}$/)
    expect(sourceRecordId?.length).toBeLessThanOrEqual(255)
    expect(
      planImageAttributionMerge(
        {
          url: imageCandidate.imageUrl as string,
          attribution: 'Jane Doe',
          sourceProvider: 'wikimedia-commons',
          sourceRecordId: null,
          sourceUrl: imageCandidate.imageUrl,
          pageUrl: imageCandidate.imagePageUrl,
          author: 'Jane Doe',
          licenseName: 'CC BY-SA 4.0',
          licenseUrl: imageCandidate.imageLicenseUrl,
        },
        imageCandidate
      )
    ).toMatchObject({ action: 'complete_metadata', data: { sourceRecordId } })
  })
})

describe('pipeline dry-run safety and reporting', () => {
  it('produces a dry-run report without creating jobs or destination rows', async () => {
    const db = {
      attraction: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const service = new DestinationImportPipelineService({
      db: db as never,
      osmProvider: { discover: vi.fn().mockResolvedValue([candidate()]) },
      wikidataProvider: { fetchEntityMetadata: vi.fn() },
      commonsProvider: {
        fetchLicensedImageByFileName: vi.fn(),
        fetchFirstLicensedCategoryImage: vi.fn(),
      },
      httpClient: new DestinationImportHttpClient({ disableRateLimit: true, fetcher: vi.fn() }),
    })

    const report = await service.run({
      area: bangkok(),
      provider: 'osm',
      limit: 10,
      dryRun: true,
      commit: false,
      enrich: false,
      maxEnrichmentRecords: 0,
      maxRequests: 1,
    })

    expect(report).toMatchObject({
      dryRun: true,
      discoveredCount: 1,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      categoryDistribution: { historic: 1 },
      osmObjectTypeDistribution: { node: 1 },
      duplicateDecisionDistribution: { new: 1 },
      candidateSourceIds: ['osm:node:1'],
    })
    expect(db.attraction.findMany).toHaveBeenCalled()
  })

  it('counts existing exact database matches separately from rejected new records', async () => {
    const db = {
      attraction: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'existing-attraction-1',
            name: 'Grand Palace',
            slug: 'grand-palace',
            description: null,
            address: null,
            latitude: 13.75,
            longitude: 100.4913,
            websiteUrl: null,
            phone: null,
          },
        ]),
      },
      destinationSourceProvenance: {
        findMany: vi.fn().mockResolvedValue([
          {
            entityId: 'existing-attraction-1',
            sourceProvider: 'openstreetmap-overpass',
            sourceRecordId: 'osm:node:1',
            externalIds: { wikidataId: 'Q209825' },
            importConfidence: 90,
            manuallyCurated: false,
          },
        ]),
      },
    }
    const service = new DestinationImportPipelineService({
      db: db as never,
      osmProvider: { discover: vi.fn().mockResolvedValue([candidate()]) },
      wikidataProvider: { fetchEntityMetadata: vi.fn() },
      commonsProvider: {
        fetchLicensedImageByFileName: vi.fn(),
        fetchFirstLicensedCategoryImage: vi.fn(),
      },
      httpClient: new DestinationImportHttpClient({ disableRateLimit: true, fetcher: vi.fn() }),
    })

    const report = await service.run({
      area: bangkok(),
      provider: 'osm',
      limit: 10,
      dryRun: true,
      commit: false,
      enrich: false,
      maxEnrichmentRecords: 0,
      maxRequests: 1,
    })

    expect(report).toMatchObject({
      acceptedCount: 0,
      reviewCount: 0,
      rejectedCount: 0,
      duplicateCount: 1,
      summary: {
        acceptedNew: 0,
        manualReview: 0,
        rejectedNew: 0,
        existingExactMatches: 1,
        existingNoChange: 1,
        safeUpdates: 0,
        probableDuplicates: 0,
        possibleDuplicates: 0,
        conflicts: 0,
      },
    })
    expect(report.duplicateDiagnostics[0].duplicateDiagnostic).toMatchObject({
      matchedEntityId: 'existing-attraction-1',
      matchedFields: ['sourceRecordId'],
    })
    expect(report.rejectionReasonDistribution).toEqual({})
  })

  it('merges verified Wikidata aliases into candidate identity keys', async () => {
    const db = {
      attraction: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const service = new DestinationImportPipelineService({
      db: db as never,
      osmProvider: { discover: vi.fn().mockResolvedValue([candidate({ wikidataId: 'Q1' })]) },
      wikidataProvider: {
        fetchEntityMetadata: vi.fn().mockResolvedValue({
          wikidataId: 'Q1',
          aliases: ['royal palace'],
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Grand_Palace',
          commonsCategory: null,
          imageFileName: null,
          officialWebsite: null,
          englishLabel: 'The Grand Palace',
          englishWikipediaTitle: 'Grand Palace',
          coordinate: { latitude: 13.75, longitude: 100.4913 },
        }),
      },
      commonsProvider: {
        fetchLicensedImageByFileName: vi.fn(),
        fetchFirstLicensedCategoryImage: vi.fn(),
      },
      httpClient: new DestinationImportHttpClient({ disableRateLimit: true, fetcher: vi.fn() }),
    })

    const report = await service.run({
      area: bangkok(),
      provider: 'osm',
      limit: 10,
      dryRun: true,
      commit: false,
      enrich: true,
      maxEnrichmentRecords: 1,
      maxRequests: 4,
    })

    expect(report.decisions[0].candidate.aliases).toContain('royal palace')
    expect(report.decisions[0].candidate.nameIdentityKeys).toContain('royal palace')
    expect(report.decisions[0].candidate.names.english).toBe('Grand Palace')
    expect(report.decisions[0].candidate.englishNameSource).toBe('osm:name:en')
    expect(report.decisions[0].qualityScores.identityConfidence).toBeGreaterThan(0)
  })

  it('fills a missing English name from a verified Wikidata English label without replacing the local primary name', async () => {
    const localName = '\u0e1e\u0e23\u0e30\u0e23\u0e32\u0e0a\u0e27\u0e31\u0e07'
    const localCandidate = candidate({
      name: localName,
      names: {
        primary: localName,
        local: localName,
        english: null,
        aliases: [],
        languages: { th: localName },
      },
      normalizedName: '',
      aliases: [],
      nameIdentityKeys: normalizeNameIdentityKeys([localName]),
      wikidataId: 'Q1',
      englishNameSource: null,
    })
    const db = {
      attraction: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const service = new DestinationImportPipelineService({
      db: db as never,
      osmProvider: { discover: vi.fn().mockResolvedValue([localCandidate]) },
      wikidataProvider: {
        fetchEntityMetadata: vi.fn().mockResolvedValue({
          wikidataId: 'Q1',
          aliases: [],
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Grand_Palace',
          commonsCategory: null,
          imageFileName: null,
          officialWebsite: null,
          englishLabel: 'Grand Palace',
          englishWikipediaTitle: 'Grand Palace',
          coordinate: { latitude: 13.75, longitude: 100.4913 },
        }),
      },
      commonsProvider: {
        fetchLicensedImageByFileName: vi.fn(),
        fetchFirstLicensedCategoryImage: vi.fn(),
      },
      httpClient: new DestinationImportHttpClient({ disableRateLimit: true, fetcher: vi.fn() }),
    })

    const report = await service.run({
      area: bangkok(),
      provider: 'osm',
      limit: 10,
      dryRun: true,
      commit: false,
      enrich: true,
      maxEnrichmentRecords: 1,
      maxRequests: 4,
    })

    expect(report.decisions[0].candidate.name).toBe(localName)
    expect(report.decisions[0].candidate.names.local).toBe(localName)
    expect(report.decisions[0].candidate.names.english).toBe('Grand Palace')
    expect(report.decisions[0].candidate.englishNameSource).toBe('wikidata:en-label')
  })
})
