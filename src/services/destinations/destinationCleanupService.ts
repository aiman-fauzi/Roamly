import { DestinationImportSource, type Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { slugify } from '@/import/normalization'
import {
  classifyLegacyCleanupRecord,
  type CleanupClassificationOptions,
} from '@/services/destinations/legacyCleanup'
import type {
  DestinationCleanupCounts,
  DestinationCleanupDecision,
  DestinationCleanupRecord,
  DestinationCleanupReference,
  DestinationCleanupSummary,
  DestinationEntityTable,
  DestinationEntityType,
} from '@/services/destinations/types'

const KUALA_LUMPUR_CENTER = { latitude: 3.1394, longitude: 101.6893 }

type CleanupTransaction = Prisma.TransactionClient

export interface DestinationCleanupOptions {
  source?: DestinationImportSource
  city?: string
  ids?: string[]
  apply?: boolean
  now?: Date
}

interface CleanupRow {
  id: string
  cityId: string
  name: string
  slug: string
  description?: string | null
  address?: string | null
  latitude?: unknown
  longitude?: unknown
  websiteUrl?: string | null
  deletedAt?: Date | null
  city: {
    id: string
    name: string
    slug: string
    latitude?: unknown
    longitude?: unknown
    country: {
      name: string
      slug: string
    }
  }
  enrichment?: { id: string } | null
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

function readSourceUrlOrIdentifier(row: CleanupRow, entityType: DestinationEntityType): string {
  return row.websiteUrl ?? `${entityType.toLowerCase()}:${row.slug}`
}

function tripReferences(
  row: CleanupRow,
  tripTexts: Array<DestinationCleanupReference & { text: string }>
): DestinationCleanupReference[] {
  const normalizedName = row.name.toLowerCase()
  return tripTexts
    .filter((trip) => trip.text.includes(row.id) || trip.text.toLowerCase().includes(normalizedName))
    .map(({ id, title }) => ({ id, title }))
}

function flatten(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function toCleanupRecord(
  row: CleanupRow,
  entityType: DestinationEntityType,
  entityTable: DestinationEntityTable,
  tripTexts: Array<DestinationCleanupReference & { text: string }>
): DestinationCleanupRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    entityType,
    entityTable,
    source: inferSource(row.websiteUrl),
    sourceUrlOrIdentifier: readSourceUrlOrIdentifier(row, entityType),
    cityId: row.cityId,
    cityName: row.city.name,
    citySlug: row.city.slug,
    countryName: row.city.country.name,
    countrySlug: row.city.country.slug,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    deletedAt: row.deletedAt,
    enrichmentId: row.enrichment?.id ?? null,
    referencedByTripsOrItineraries: tripReferences(row, tripTexts),
  }
}

function sourceWhere(source?: DestinationImportSource): { websiteUrl?: { contains: string } } {
  if (source === DestinationImportSource.WIKIVOYAGE) return { websiteUrl: { contains: 'wikivoyage.org' } }
  if (source === DestinationImportSource.WIKIPEDIA) return { websiteUrl: { contains: 'wikipedia.org' } }
  return {}
}

function cityWhere(city?: string) {
  if (!city) return undefined
  const normalized = slugify(city)
  return {
    OR: [
      { slug: normalized },
      { name: { equals: city.trim(), mode: 'insensitive' as const } },
    ],
  }
}

function idsWhere(ids?: string[]) {
  return ids && ids.length > 0 ? { id: { in: ids } } : {}
}

function activeWhere(ids?: string[]) {
  return ids && ids.length > 0 ? {} : { deletedAt: null }
}

function classificationOptions(record: DestinationCleanupRecord): CleanupClassificationOptions {
  const cityCenter =
    record.countrySlug === 'malaysia' && record.citySlug === 'kuala-lumpur'
      ? KUALA_LUMPUR_CENTER
      : undefined

  return {
    source: DestinationImportSource.WIKIVOYAGE,
    city: record.cityName,
    citySlug: record.citySlug,
    countrySlug: record.countrySlug,
    cityCenter,
    reviewRadiusKm: 45,
  }
}

function activeDecisions(decisions: DestinationCleanupDecision[]): DestinationCleanupDecision[] {
  return decisions.filter(
    (decision) => decision.recommendedAction === 'QUARANTINE' && decision.safeToApply
  )
}

export class DestinationCleanupService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async run(options: DestinationCleanupOptions = {}): Promise<DestinationCleanupSummary> {
    const beforeCounts = await this.readCounts()
    const records = await this.readRecords(options)
    const decisions = records.map((record) =>
      classifyLegacyCleanupRecord(record, {
        ...classificationOptions(record),
        source: options.source ?? DestinationImportSource.WIKIVOYAGE,
        city: options.city ?? record.cityName,
      })
    )
    const toApply = activeDecisions(decisions)

    if (options.apply && toApply.length > 0) {
      await this.db.$transaction((tx) => this.quarantineRecords(tx, toApply, options.now ?? new Date()))
    }

    const afterCounts = await this.readCounts()

    return {
      mode: options.apply ? 'apply' : 'dry-run',
      beforeCounts,
      afterCounts,
      inspectedRecords: records.length,
      affectedRecords: options.apply ? toApply.length : toApply.length,
      decisions,
    }
  }

  private async readCounts(): Promise<DestinationCleanupCounts> {
    const [attractions, restaurants, hotels, activities] = await Promise.all([
      this.db.attraction.count({ where: { deletedAt: null } }),
      this.db.restaurant.count({ where: { deletedAt: null } }),
      this.db.hotel.count({ where: { deletedAt: null } }),
      this.db.activity.count({ where: { deletedAt: null } }),
    ])

    return { attractions, restaurants, hotels, activities }
  }

  private async readRecords(options: DestinationCleanupOptions): Promise<DestinationCleanupRecord[]> {
    const tripRows = await this.db.trip.findMany({
      select: { id: true, title: true, itineraryJson: true },
    })
    const tripTexts = tripRows.map((trip) => ({
      id: trip.id,
      title: trip.title,
      text: flatten(trip.itineraryJson),
    }))
    const city = cityWhere(options.city)

    const [attractions, restaurants, hotels, activities] = await Promise.all([
      this.db.attraction.findMany({
        where: {
          ...activeWhere(options.ids),
          ...idsWhere(options.ids),
          ...sourceWhere(options.source),
          city,
        },
        include: { city: { include: { country: true } }, enrichment: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
      this.db.restaurant.findMany({
        where: {
          ...activeWhere(options.ids),
          ...idsWhere(options.ids),
          ...sourceWhere(options.source),
          city,
        },
        include: { city: { include: { country: true } }, enrichment: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
      this.db.hotel.findMany({
        where: {
          ...activeWhere(options.ids),
          ...idsWhere(options.ids),
          ...sourceWhere(options.source),
          city,
        },
        include: { city: { include: { country: true } }, enrichment: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
      this.db.activity.findMany({
        where: {
          ...activeWhere(options.ids),
          ...idsWhere(options.ids),
          ...sourceWhere(options.source),
          city,
        },
        include: { city: { include: { country: true } }, enrichment: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
    ])

    return [
      ...attractions.map((row) => toCleanupRecord(row, 'ATTRACTION', 'attractions', tripTexts)),
      ...restaurants.map((row) => toCleanupRecord(row, 'RESTAURANT', 'restaurants', tripTexts)),
      ...hotels.map((row) => toCleanupRecord(row, 'HOTEL', 'hotels', tripTexts)),
      ...activities.map((row) => toCleanupRecord(row, 'ACTIVITY', 'activities', tripTexts)),
    ]
  }

  private async quarantineRecords(
    tx: CleanupTransaction,
    decisions: DestinationCleanupDecision[],
    deletedAt: Date
  ): Promise<void> {
    const byTable = new Map<DestinationEntityTable, string[]>()
    for (const decision of decisions) {
      const ids = byTable.get(decision.record.entityTable) ?? []
      ids.push(decision.record.id)
      byTable.set(decision.record.entityTable, ids)
    }

    const attractionIds = byTable.get('attractions') ?? []
    const restaurantIds = byTable.get('restaurants') ?? []
    const hotelIds = byTable.get('hotels') ?? []
    const activityIds = byTable.get('activities') ?? []

    if (attractionIds.length > 0) {
      await tx.attraction.updateMany({
        where: { id: { in: attractionIds }, deletedAt: null },
        data: { deletedAt },
      })
    }
    if (restaurantIds.length > 0) {
      await tx.restaurant.updateMany({
        where: { id: { in: restaurantIds }, deletedAt: null },
        data: { deletedAt },
      })
    }
    if (hotelIds.length > 0) {
      await tx.hotel.updateMany({
        where: { id: { in: hotelIds }, deletedAt: null },
        data: { deletedAt },
      })
    }
    if (activityIds.length > 0) {
      await tx.activity.updateMany({
        where: { id: { in: activityIds }, deletedAt: null },
        data: { deletedAt },
      })
    }
  }
}
