import { DestinationImportSource } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { normalizeAndDedupe } from '@/import/normalizeDestinationRecords'
import { GovernmentTourismParser } from '@/import/parsers/governmentTourismParser'
import { OpenStreetMapParser } from '@/import/parsers/openStreetMapParser'
import type { ImportSourceConfig, RawDestinationRecord } from '@/import/types'
import { DestinationImportService } from '@/services/import/destinationImportService'

const baseConfig: ImportSourceConfig = {
  source: DestinationImportSource.OPENSTREETMAP,
  sourceKey: 'test-source',
  url: 'https://example.com/source.json',
  cityName: 'Kuala Lumpur',
  citySlug: 'kuala-lumpur',
  countrySlug: 'malaysia',
}

describe('destination import parsing', () => {
  it('parses OpenStreetMap Overpass elements into destination records', () => {
    const payload = JSON.stringify({
      elements: [
        {
          type: 'node',
          id: 10,
          lat: 3.1501,
          lon: 101.7077,
          tags: {
            name: 'Central Market',
            tourism: 'attraction',
            website: 'https://example.com/central-market',
            'addr:city': 'Kuala Lumpur',
          },
        },
      ],
    })

    const records = new OpenStreetMapParser().parse(payload, baseConfig)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceId: 'osm:node:10',
      name: 'Central Market',
      kind: 'ATTRACTION',
      latitude: 3.1501,
      longitude: 101.7077,
    })
  })

  it('parses government CSV datasets with configurable city context', () => {
    const parser = new GovernmentTourismParser()
    const records = parser.parse(
      'id,name,category,latitude,longitude\nabc-1,Jalan Alor,food,3.1467,101.7089',
      {
        ...baseConfig,
        source: DestinationImportSource.GOVERNMENT_TOURISM,
        defaultKind: 'RESTAURANT',
      }
    )

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceId: 'government:abc-1',
      name: 'Jalan Alor',
      kind: 'RESTAURANT',
      cityName: 'Kuala Lumpur',
    })
  })
})

describe('destination import normalization', () => {
  it('skips invalid coordinates and duplicate destination rows', () => {
    const rawRecords: RawDestinationRecord[] = [
      {
        source: DestinationImportSource.OPENSTREETMAP,
        sourceId: 'one',
        name: 'Museum A',
        kind: 'ATTRACTION',
        latitude: 3.1,
        longitude: 101.7,
        cityName: 'Kuala Lumpur',
      },
      {
        source: DestinationImportSource.OPENSTREETMAP,
        sourceId: 'duplicate',
        name: 'Museum A',
        kind: 'ATTRACTION',
        latitude: 3.10001,
        longitude: 101.70001,
        cityName: 'Kuala Lumpur',
      },
      {
        source: DestinationImportSource.OPENSTREETMAP,
        sourceId: 'bad-coordinates',
        name: 'Broken Place',
        kind: 'ATTRACTION',
        latitude: 999,
        longitude: 999,
        cityName: 'Kuala Lumpur',
      },
    ]

    const result = normalizeAndDedupe(rawRecords)

    expect(result.records).toHaveLength(1)
    expect(result.records[0].slug).toBe('museum-a')
    expect(result.skipped).toBe(2)
  })
})

interface MockImportJob {
  id: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  cursor: number
  totalRecords: number
  processedRecords: number
  skippedRecords: number
  failedRecords: number
  errorMessage: string | null
}

function createMockImportDb() {
  const job: MockImportJob = {
    id: 'job-1',
    status: 'RUNNING',
    cursor: 0,
    totalRecords: 0,
    processedRecords: 0,
    skippedRecords: 0,
    failedRecords: 0,
    errorMessage: null,
  }

  const db = {
    destinationImportJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(job),
      update: vi.fn().mockImplementation(({ data }) => {
        if (typeof data.totalRecords === 'number') job.totalRecords = data.totalRecords
        if (typeof data.cursor === 'number') job.cursor = data.cursor
        if (typeof data.status === 'string') job.status = data.status
        if (typeof data.errorMessage === 'string' || data.errorMessage === null) {
          job.errorMessage = data.errorMessage
        }
        if (data.processedRecords?.increment) job.processedRecords += data.processedRecords.increment
        if (data.skippedRecords?.increment) job.skippedRecords += data.skippedRecords.increment
        if (data.failedRecords?.increment) job.failedRecords += data.failedRecords.increment
        return Promise.resolve({ ...job })
      }),
    },
    city: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn().mockImplementation((callback) => callback(db)),
  }

  return db
}

function createPersistingMockImportDb() {
  const db = createMockImportDb() as ReturnType<typeof createMockImportDb> & {
    destinationTag: { upsert: ReturnType<typeof vi.fn> }
    restaurant: {
      findUnique: ReturnType<typeof vi.fn>
      upsert: ReturnType<typeof vi.fn>
    }
    destinationImage: {
      count: ReturnType<typeof vi.fn>
    }
    openingHour: {
      count: ReturnType<typeof vi.fn>
    }
  }

  db.city.findFirst.mockResolvedValue({ id: 'city-1' })
  db.destinationTag = {
    upsert: vi.fn().mockResolvedValue({ id: 'tag-1' }),
  }
  db.restaurant = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: 'restaurant-1' }),
  }
  db.destinationImage = {
    count: vi.fn().mockResolvedValue(0),
  }
  db.openingHour = {
    count: vi.fn().mockResolvedValue(0),
  }

  return db
}

describe('destination import service job status', () => {
  it('fails the job when the source returns no usable records', async () => {
    const db = createMockImportDb()
    const service = new DestinationImportService({
      db: db as never,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [] }))),
    })

    const summary = await service.import(baseConfig)

    expect(summary).toMatchObject({
      status: 'FAILED',
      fetchedRecords: 0,
      normalizedRecords: 0,
      processedRecords: 0,
    })
    expect(db.destinationImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Destination import source returned no records.',
        }),
      })
    )
  })

  it('fails the job when normalized records cannot be persisted', async () => {
    const db = createMockImportDb()
    const service = new DestinationImportService({
      db: db as never,
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'node',
                id: 10,
                lat: 3.1501,
                lon: 101.7077,
                tags: {
                  name: 'Central Market',
                  tourism: 'attraction',
                },
              },
            ],
          })
        )
      ),
    })

    const summary = await service.import({
      source: DestinationImportSource.OPENSTREETMAP,
      sourceKey: 'missing-location-context',
      url: 'https://example.com/source.json',
      cityName: 'Kuala Lumpur',
      defaultKind: 'ATTRACTION',
    })

    expect(summary).toMatchObject({
      status: 'FAILED',
      fetchedRecords: 1,
      normalizedRecords: 1,
      processedRecords: 0,
      skippedRecords: 1,
    })
    expect(db.destinationImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Destination import persisted no destination records.',
        }),
      })
    )
  })

  it('counts relevance decisions and persists only accepted records', async () => {
    const db = createPersistingMockImportDb()
    const service = new DestinationImportService({
      db: db as never,
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'node',
                id: 10,
                lat: 3.1764,
                lon: 101.6993,
                tags: {
                  name: 'Restoran Haslam',
                  amenity: 'restaurant',
                  cuisine: 'malaysian',
                  'addr:city': 'Kuala Lumpur',
                },
              },
              {
                type: 'node',
                id: 20,
                lat: 3.9333,
                lon: 102.3667,
                tags: {
                  name: 'Far Away Museum',
                  tourism: 'attraction',
                },
              },
            ],
          })
        )
      ),
    })

    const summary = await service.import({
      ...baseConfig,
      countryName: 'Malaysia',
      countryCode: 'MY',
    })

    expect(summary).toMatchObject({
      status: 'COMPLETED',
      fetchedRecords: 2,
      normalizedRecords: 2,
      acceptedRecords: 1,
      reviewRecords: 0,
      rejectedRecords: 1,
      createdRecords: 1,
      skippedRecords: 1,
      failedRecords: 0,
    })
    expect(db.restaurant.upsert).toHaveBeenCalledTimes(1)
  })
})
