import {
  DestinationFactEntityType,
  DestinationFactType,
  type PrismaClient,
} from '@prisma/client'

import { prisma } from '@/db/client'
import { resolveDestinationCity } from '@/services/destinations/destinationRetrievalService'
import { DestinationFactService, destinationFactKey } from '@/services/destinations/facts/destinationFactService'
import { haversineDistanceKm, isValidGeoPoint } from '@/services/destinations/geo'
import type { DestinationEntityType } from '@/services/destinations/types'

interface AuditEntity {
  entityType: DestinationEntityType
  entityId: string
  name: string
  slug: string
  latitude?: number | null
  longitude?: number | null
  sourceUrl?: string | null
  enriched: boolean
}

export interface DestinationQualityAuditSummary {
  cityId: string
  cityName: string
  activeEntities: Record<DestinationEntityType, number>
  quarantinedEntities: Record<DestinationEntityType, number>
  totalActiveEntities: number
  verifiedOpeningHours: number
  verifiedOpeningHoursCoverage: number
  verifiedTicketPrices: number
  verifiedTicketPriceCoverage: number
  staleFacts: number
  conflictingFacts: number
  missingCoordinates: number
  missingSourceUrls: number
  possibleDuplicates: number
  geminiEnriched: number
  geminiEnrichedCoverage: number
}

function emptyCounts(): Record<DestinationEntityType, number> {
  return { ATTRACTION: 0, RESTAURANT: 0, HOTEL: 0, ACTIVITY: 0 }
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100)
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

function factEntityType(entityType: DestinationEntityType): DestinationFactEntityType {
  return DestinationFactEntityType[entityType]
}

function duplicatePairCount(entities: AuditEntity[]): number {
  let count = 0
  for (let index = 0; index < entities.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < entities.length; otherIndex += 1) {
      const first = entities[index]
      const second = entities[otherIndex]
      if (first.entityType !== second.entityType) continue
      if (first.slug === second.slug) {
        count += 1
        continue
      }
      if (
        first.latitude == null ||
        first.longitude == null ||
        second.latitude == null ||
        second.longitude == null
      ) {
        continue
      }
      const distance = haversineDistanceKm(
        { latitude: first.latitude, longitude: first.longitude },
        { latitude: second.latitude, longitude: second.longitude }
      )
      if (distance < 0.08) count += 1
    }
  }
  return count
}

export class DestinationQualityAuditService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly factService = new DestinationFactService(db)
  ) {}

  async auditCity(destination: string): Promise<DestinationQualityAuditSummary> {
    const city = await resolveDestinationCity(destination, this.db)
    if (!city) throw new Error(`Destination city not found: ${destination}`)

    const cityWhere = {
      cityId: city.id,
    }
    const [attractions, restaurants, hotels, activities, quarantined] = await Promise.all([
      this.db.attraction.findMany({
        where: { ...cityWhere, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          latitude: true,
          longitude: true,
          websiteUrl: true,
          enrichment: { select: { id: true } },
        },
      }),
      this.db.restaurant.findMany({
        where: { ...cityWhere, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          latitude: true,
          longitude: true,
          websiteUrl: true,
          enrichment: { select: { id: true } },
        },
      }),
      this.db.hotel.findMany({
        where: { ...cityWhere, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          latitude: true,
          longitude: true,
          websiteUrl: true,
          enrichment: { select: { id: true } },
        },
      }),
      this.db.activity.findMany({
        where: { ...cityWhere, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          latitude: true,
          longitude: true,
          websiteUrl: true,
          enrichment: { select: { id: true } },
        },
      }),
      Promise.all([
        this.db.attraction.count({ where: { ...cityWhere, deletedAt: { not: null } } }),
        this.db.restaurant.count({ where: { ...cityWhere, deletedAt: { not: null } } }),
        this.db.hotel.count({ where: { ...cityWhere, deletedAt: { not: null } } }),
        this.db.activity.count({ where: { ...cityWhere, deletedAt: { not: null } } }),
      ]),
    ])

    const entities: AuditEntity[] = [
      ...attractions.map((row) => ({
        entityType: 'ATTRACTION' as const,
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        sourceUrl: row.websiteUrl,
        enriched: Boolean(row.enrichment),
      })),
      ...restaurants.map((row) => ({
        entityType: 'RESTAURANT' as const,
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        sourceUrl: row.websiteUrl,
        enriched: Boolean(row.enrichment),
      })),
      ...hotels.map((row) => ({
        entityType: 'HOTEL' as const,
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        sourceUrl: row.websiteUrl,
        enriched: Boolean(row.enrichment),
      })),
      ...activities.map((row) => ({
        entityType: 'ACTIVITY' as const,
        entityId: row.id,
        name: row.name,
        slug: row.slug,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        sourceUrl: row.websiteUrl,
        enriched: Boolean(row.enrichment),
      })),
    ]

    const activeEntities = emptyCounts()
    for (const entity of entities) activeEntities[entity.entityType] += 1
    const totalActiveEntities = entities.length
    const refs = entities.map((entity) => ({
      entityType: factEntityType(entity.entityType),
      entityId: entity.entityId,
    }))
    const effectiveFacts = await this.factService.resolveEffectiveFactsForEntities(refs, [
      DestinationFactType.OPENING_HOURS,
      DestinationFactType.TICKET_PRICE,
    ])
    const verifiedOpeningHours = refs.filter(
      (ref) => effectiveFacts.get(destinationFactKey(ref, DestinationFactType.OPENING_HOURS))?.status === 'VERIFIED'
    ).length
    const verifiedTicketPrices = refs.filter(
      (ref) => effectiveFacts.get(destinationFactKey(ref, DestinationFactType.TICKET_PRICE))?.status === 'VERIFIED'
    ).length
    const selectedFacts = [...effectiveFacts.values()]

    return {
      cityId: city.id,
      cityName: city.name,
      activeEntities,
      quarantinedEntities: {
        ATTRACTION: quarantined[0],
        RESTAURANT: quarantined[1],
        HOTEL: quarantined[2],
        ACTIVITY: quarantined[3],
      },
      totalActiveEntities,
      verifiedOpeningHours,
      verifiedOpeningHoursCoverage: percent(verifiedOpeningHours, totalActiveEntities),
      verifiedTicketPrices,
      verifiedTicketPriceCoverage: percent(verifiedTicketPrices, totalActiveEntities),
      staleFacts: selectedFacts.filter((fact) => fact.stale || fact.status === 'STALE').length,
      conflictingFacts: selectedFacts.reduce((total, fact) => total + fact.conflicts.length, 0),
      missingCoordinates: entities.filter((entity) => {
        if (entity.latitude == null || entity.longitude == null) return true
        return !isValidGeoPoint({ latitude: entity.latitude, longitude: entity.longitude })
      }).length,
      missingSourceUrls: entities.filter((entity) => !entity.sourceUrl).length,
      possibleDuplicates: duplicatePairCount(entities),
      geminiEnriched: entities.filter((entity) => entity.enriched).length,
      geminiEnrichedCoverage: percent(
        entities.filter((entity) => entity.enriched).length,
        totalActiveEntities
      ),
    }
  }
}
