import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { DestinationCompletenessAuditService } from '@/services/destinations/destinationCompletenessAudit'

const city = {
  country: {
    currencyCode: 'MYR',
  },
}

const baseRow = {
  id: 'row-1',
  name: 'Central Market',
  latitude: 3.145,
  longitude: 101.695,
  address: 'Kuala Lumpur',
  description: 'A heritage market.',
  websiteUrl: 'https://www.openstreetmap.org/node/1',
  priceLevel: 1,
  durationMinutes: 90,
  updatedAt: new Date('2026-08-04T00:00:00.000Z'),
  city,
  tags: [{ slug: 'heritage' }],
  openingHours: [{ id: 'hours-1' }],
  enrichment: null,
}

function dbMock() {
  return {
    attraction: {
      findMany: vi.fn().mockResolvedValue([baseRow]),
    },
    restaurant: {
      findMany: vi.fn().mockResolvedValue([
        {
          ...baseRow,
          id: 'restaurant-1',
          name: 'Local Cafe',
          address: null,
          description: null,
          priceLevel: null,
          durationMinutes: null,
          tags: [],
          openingHours: [],
          cuisines: ['local'],
        },
      ]),
    },
    hotel: {
      findMany: vi.fn().mockResolvedValue([
        {
          ...baseRow,
          id: 'hotel-1',
          name: 'Sample Hotel',
          websiteUrl: 'https://en.wikivoyage.org/wiki/Kuala_Lumpur',
          amenities: ['wifi'],
          enrichment: {
            estimatedVisitDurationMinutes: 60,
            generatedAt: new Date('2026-08-03T00:00:00.000Z'),
          },
        },
      ]),
    },
    activity: {
      findMany: vi.fn().mockResolvedValue([
        {
          ...baseRow,
          id: 'activity-1',
          name: 'Walking Tour',
          category: 'walking',
        },
      ]),
    },
  } as unknown as PrismaClient
}

describe('DestinationCompletenessAuditService', () => {
  it('reports record-level factual completeness and aggregate percentages', async () => {
    const service = new DestinationCompletenessAuditService(dbMock())

    const audit = await service.auditCity('city-1')

    expect(audit.records).toHaveLength(4)
    expect(audit.records.find((record) => record.entityType === 'ATTRACTION')).toMatchObject({
      hasCoordinates: true,
      hasAddress: true,
      hasDescription: true,
      hasCategories: true,
      hasOpeningHours: true,
      hasTicketPrice: true,
      hasCurrency: true,
      hasEstimatedVisitDuration: true,
      enrichmentState: 'PARTIALLY_ENRICHED',
    })
    expect(audit.records.find((record) => record.entityType === 'HOTEL')).toMatchObject({
      source: 'WIKIVOYAGE',
      enrichmentState: 'ENRICHED',
      lastVerifiedAt: new Date('2026-08-03T00:00:00.000Z'),
    })
    expect(audit.aggregates.find((item) => item.entityType === 'ATTRACTION')).toMatchObject({
      total: 1,
      coordinates: 100,
      address: 100,
      openingHours: 100,
      ticketPrice: 100,
    })
    expect(audit.aggregates.find((item) => item.entityType === 'RESTAURANT')).toMatchObject({
      total: 1,
      address: 0,
      description: 0,
      categories: 100,
      openingHours: 0,
      ticketPrice: 0,
      estimatedVisitDuration: 0,
    })
  })
})
