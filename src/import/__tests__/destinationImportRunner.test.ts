import { DestinationImportSource } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  buildDestinationImportConfig,
  parseDestinationImportArgs,
  runDestinationImportCli,
} from '@/import/destinationImportRunner'

describe('destination import runner', () => {
  it('parses required CLI arguments with a default limit', () => {
    const args = parseDestinationImportArgs([
      '--source=wikivoyage',
      '--country=Malaysia',
      '--city=Kuala Lumpur',
    ])

    expect(args).toEqual({
      source: DestinationImportSource.WIKIVOYAGE,
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      limit: 50,
    })
  })

  it('builds a stable Wikivoyage import config from country and city', () => {
    const config = buildDestinationImportConfig({
      source: DestinationImportSource.WIKIVOYAGE,
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      limit: 25,
    })

    expect(config.sourceKey).toBe('wikivoyage:malaysia:kuala-lumpur:25')
    expect(config.countryName).toBe('Malaysia')
    expect(config.countrySlug).toBe('malaysia')
    expect(config.countryCode).toBe('MY')
    expect(config.countryIso3).toBe('MYS')
    expect(config.currencyCode).toBe('MYR')
    expect(config.citySlug).toBe('kuala-lumpur')
    expect(config.cityName).toBe('Kuala Lumpur')
    expect(config.url).toContain('https://en.wikivoyage.org/w/api.php')
    expect(decodeURIComponent(config.url).replace(/\+/g, ' ')).toContain('titles=Kuala Lumpur')
    expect(config.url).toContain('rvprop=content')
  })

  it('builds an OpenStreetMap Overpass URL with the requested limit', () => {
    const config = buildDestinationImportConfig({
      source: DestinationImportSource.OPENSTREETMAP,
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      limit: 10,
    })

    expect(config.sourceKey).toBe('openstreetmap:malaysia:kuala-lumpur:10')
    expect(config.url).toContain('https://overpass-api.de/api/interpreter')
    expect(decodeURIComponent(config.url)).toContain('out center 10')
  })

  it('rejects import URLs outside the approved source policy', () => {
    const previous = process.env.GOVERNMENT_TOURISM_DATASET_URL
    process.env.GOVERNMENT_TOURISM_DATASET_URL = 'https://unapproved.example/dataset.json'

    try {
      expect(() =>
        buildDestinationImportConfig({
          source: DestinationImportSource.GOVERNMENT_TOURISM,
          country: 'Malaysia',
          city: 'Kuala Lumpur',
          limit: 10,
        })
      ).toThrow(/not allowlisted/)
    } finally {
      if (previous === undefined) {
        delete process.env.GOVERNMENT_TOURISM_DATASET_URL
      } else {
        process.env.GOVERNMENT_TOURISM_DATASET_URL = previous
      }
    }
  })

  it('allows existing Wikipedia imports through the source policy registry', () => {
    const config = buildDestinationImportConfig({
      source: DestinationImportSource.WIKIPEDIA,
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      limit: 10,
    })

    expect(config.url).toContain('https://en.wikipedia.org/w/api.php')
  })

  it('skips a duplicate completed import job and verifies attractions', async () => {
    const db = {
      destinationImportJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: 'COMPLETED',
          cursor: 3,
          totalRecords: 3,
          processedRecords: 3,
          skippedRecords: 0,
          failedRecords: 0,
        }),
      },
      attraction: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          { name: 'Central Market', slug: 'central-market' },
          { name: 'Merdeka Square', slug: 'merdeka-square' },
        ]),
      },
    }
    const service = { import: vi.fn() }

    await expect(
      runDestinationImportCli(
        ['--source=wikivoyage', '--country=Malaysia', '--city=Kuala Lumpur'],
        { db: db as never, service, pollIntervalMs: 1 }
      )
    ).resolves.toBe(0)

    expect(service.import).not.toHaveBeenCalled()
  })

  it('rejects invalid limits', () => {
    expect(() =>
      parseDestinationImportArgs([
        '--source=wikivoyage',
        '--country=Malaysia',
        '--city=Kuala Lumpur',
        '--limit=0',
      ])
    ).toThrow('positive integer')
  })
})
