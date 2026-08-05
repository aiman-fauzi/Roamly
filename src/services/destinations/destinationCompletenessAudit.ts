import { DestinationImportSource, type PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { isValidGeoPoint } from '@/services/destinations/geo'
import type {
  CandidateEnrichmentState,
  DestinationEntityType,
} from '@/services/destinations/types'

export interface DestinationCompletenessRecord {
  id: string
  name: string
  entityType: DestinationEntityType
  source: DestinationImportSource
  sourceUrl?: string | null
  hasCoordinates: boolean
  hasAddress: boolean
  hasDescription: boolean
  hasCategories: boolean
  hasOpeningHours: boolean
  hasTicketPrice: boolean
  hasCurrency: boolean
  hasEstimatedVisitDuration: boolean
  lastVerifiedAt?: Date
  enrichmentState: CandidateEnrichmentState
}

export interface DestinationCompletenessAggregate {
  entityType: DestinationEntityType
  total: number
  coordinates: number
  address: number
  description: number
  categories: number
  openingHours: number
  ticketPrice: number
  currency: number
  estimatedVisitDuration: number
}

export interface DestinationCompletenessAudit {
  cityId: string
  records: DestinationCompletenessRecord[]
  aggregates: DestinationCompletenessAggregate[]
}

interface AuditRow {
  id: string
  name: string
  latitude?: unknown
  longitude?: unknown
  address?: string | null
  description?: string | null
  websiteUrl?: string | null
  priceLevel?: number | null
  durationMinutes?: number | null
  updatedAt: Date
  city: { country: { currencyCode?: string | null } }
  tags: Array<{ slug: string }>
  openingHours: Array<{ id: string }>
  enrichment?: { estimatedVisitDurationMinutes: number; generatedAt: Date } | null
}

interface RestaurantAuditRow extends AuditRow {
  cuisines: string[]
}

interface HotelAuditRow extends AuditRow {
  amenities: string[]
}

interface ActivityAuditRow extends AuditRow {
  category?: string | null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inferSource(sourceUrl?: string | null): DestinationImportSource {
  if (sourceUrl?.includes('wikivoyage.org')) return DestinationImportSource.WIKIVOYAGE
  if (sourceUrl?.includes('wikipedia.org')) return DestinationImportSource.WIKIPEDIA
  return DestinationImportSource.OPENSTREETMAP
}

function enrichmentState(row: AuditRow): CandidateEnrichmentState {
  if (row.enrichment) return 'ENRICHED'
  if (
    row.description ||
    row.tags.length > 0 ||
    row.openingHours.length > 0 ||
    row.durationMinutes ||
    row.priceLevel != null
  ) {
    return 'PARTIALLY_ENRICHED'
  }
  return 'SOURCE_ONLY'
}

function toRecord(
  entityType: DestinationEntityType,
  row: AuditRow,
  categories: string[]
): DestinationCompletenessRecord {
  const latitude = toNumber(row.latitude)
  const longitude = toNumber(row.longitude)
  return {
    id: row.id,
    name: row.name,
    entityType,
    source: inferSource(row.websiteUrl),
    sourceUrl: row.websiteUrl,
    hasCoordinates:
      latitude != null && longitude != null && isValidGeoPoint({ latitude, longitude }),
    hasAddress: Boolean(row.address),
    hasDescription: Boolean(row.description),
    hasCategories: row.tags.length > 0 || categories.length > 0,
    hasOpeningHours: row.openingHours.length > 0,
    hasTicketPrice: row.priceLevel != null,
    hasCurrency: Boolean(row.city.country.currencyCode),
    hasEstimatedVisitDuration: Boolean(row.durationMinutes || row.enrichment?.estimatedVisitDurationMinutes),
    lastVerifiedAt: row.enrichment?.generatedAt ?? row.updatedAt,
    enrichmentState: enrichmentState(row),
  }
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100)
}

function aggregate(
  entityType: DestinationEntityType,
  records: DestinationCompletenessRecord[]
): DestinationCompletenessAggregate {
  const scoped = records.filter((record) => record.entityType === entityType)
  const total = scoped.length
  return {
    entityType,
    total,
    coordinates: percent(scoped.filter((record) => record.hasCoordinates).length, total),
    address: percent(scoped.filter((record) => record.hasAddress).length, total),
    description: percent(scoped.filter((record) => record.hasDescription).length, total),
    categories: percent(scoped.filter((record) => record.hasCategories).length, total),
    openingHours: percent(scoped.filter((record) => record.hasOpeningHours).length, total),
    ticketPrice: percent(scoped.filter((record) => record.hasTicketPrice).length, total),
    currency: percent(scoped.filter((record) => record.hasCurrency).length, total),
    estimatedVisitDuration: percent(
      scoped.filter((record) => record.hasEstimatedVisitDuration).length,
      total
    ),
  }
}

export class DestinationCompletenessAuditService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async auditCity(cityId: string): Promise<DestinationCompletenessAudit> {
    const include = {
      city: { include: { country: true } },
      tags: true,
      openingHours: { where: { deletedAt: null } },
      enrichment: true,
    }
    const [attractions, restaurants, hotels, activities] = await Promise.all([
      this.db.attraction.findMany({ where: { cityId, deletedAt: null }, include }),
      this.db.restaurant.findMany({ where: { cityId, deletedAt: null }, include }),
      this.db.hotel.findMany({ where: { cityId, deletedAt: null }, include }),
      this.db.activity.findMany({ where: { cityId, deletedAt: null }, include }),
    ])

    const records = [
      ...attractions.map((row) => toRecord('ATTRACTION', row, [])),
      ...restaurants.map((row: RestaurantAuditRow) => toRecord('RESTAURANT', row, row.cuisines)),
      ...hotels.map((row: HotelAuditRow) => toRecord('HOTEL', row, row.amenities)),
      ...activities.map((row: ActivityAuditRow) =>
        toRecord('ACTIVITY', row, row.category ? [row.category] : [])
      ),
    ]

    return {
      cityId,
      records,
      aggregates: ['ATTRACTION', 'RESTAURANT', 'HOTEL', 'ACTIVITY'].map((entityType) =>
        aggregate(entityType as DestinationEntityType, records)
      ),
    }
  }
}
