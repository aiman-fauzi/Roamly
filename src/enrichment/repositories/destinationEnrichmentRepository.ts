import { DestinationImportSource, type PrismaClient } from '@prisma/client'

import type {
  EnrichableDestination,
  EnrichableDestinationKind,
  GeneratedDestinationEnrichment,
} from '@/enrichment/types'
import { evaluateDestinationRecords } from '@/import/relevance'
import type { NormalizedDestinationRecord } from '@/import/types'

type ParentConnect =
  | { attractionId: string }
  | { restaurantId: string }
  | { hotelId: string }
  | { activityId: string }

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inferSource(sourceUrl: string | null | undefined): DestinationImportSource {
  if (sourceUrl?.includes('wikivoyage.org')) return DestinationImportSource.WIKIVOYAGE
  if (sourceUrl?.includes('wikipedia.org')) return DestinationImportSource.WIKIPEDIA
  return DestinationImportSource.OPENSTREETMAP
}

function isEligibleForEnrichment(destination: EnrichableDestination): boolean {
  const latitude = destination.latitude ?? Number.NaN
  const longitude = destination.longitude ?? Number.NaN
  const source = inferSource(destination.sourceUrl)
  const record: NormalizedDestinationRecord = {
    source,
    sourceId: `${source.toLowerCase()}:${destination.kind.toLowerCase()}:${destination.id}`,
    kind: destination.kind,
    name: destination.name,
    slug: destination.slug ?? destination.name.toLowerCase(),
    description: destination.description ?? undefined,
    address: destination.address ?? undefined,
    latitude,
    longitude,
    cityName: destination.cityName,
    citySlug: destination.citySlug,
    countryName: destination.countryName,
    countrySlug: destination.countrySlug,
    sourceUrl: destination.sourceUrl ?? undefined,
    websiteUrl: destination.sourceUrl ?? undefined,
    cuisines: destination.cuisines ?? [],
    amenities: destination.amenities ?? [],
    tags: destination.tags,
    images: [],
    openingHours: [],
    fingerprint: `${destination.kind}:${destination.citySlug ?? destination.cityName}:${destination.slug ?? destination.name}:${latitude}:${longitude}`,
  }
  const evaluated = evaluateDestinationRecords(
    [record],
    {
      source,
      sourceKey: 'destination-enrichment-quality-gate',
      url: destination.sourceUrl ?? '',
      countryName: destination.countryName,
      countrySlug: destination.countrySlug,
      cityName: destination.cityName,
      citySlug: destination.citySlug,
    }
  )[0]

  if (evaluated.relevance?.status !== 'ACCEPT') {
    console.warn('Destination enrichment skipped low-quality record', {
      destinationId: destination.id,
      kind: destination.kind,
      name: destination.name,
      status: evaluated.relevance?.status,
      rejectionReasons: evaluated.relevance?.rejectionReasons,
      relevanceScore: evaluated.relevance?.relevanceScore,
    })
    return false
  }

  return true
}

export class DestinationEnrichmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async findPendingDestinations(limit: number): Promise<EnrichableDestination[]> {
    const buckets = await Promise.all([
      this.findAttractions(limit),
      this.findRestaurants(limit),
      this.findHotels(limit),
      this.findActivities(limit),
    ])

    return buckets.flat().filter(isEligibleForEnrichment).slice(0, limit)
  }

  async save(destination: EnrichableDestination, enrichment: GeneratedDestinationEnrichment) {
    const parent = this.parentConnect(destination.kind, destination.id)
    await this.db.destinationEnrichment.create({
      data: {
        ...parent,
        shortSummary: enrichment.shortSummary,
        bestFor: enrichment.bestFor,
        hiddenGemScore: enrichment.hiddenGemScore,
        photographyScore: enrichment.photographyScore,
        familyFriendly: enrichment.familyFriendly,
        coupleFriendly: enrichment.coupleFriendly,
        kidsFriendly: enrichment.kidsFriendly,
        budgetLevel: enrichment.budgetLevel,
        estimatedVisitDurationMinutes: enrichment.estimatedVisitDurationMinutes,
        bestVisitingHours: enrichment.bestVisitingHours,
        indoorOutdoor: enrichment.indoorOutdoor,
        rainFriendly: enrichment.rainFriendly,
        searchTags: enrichment.searchTags,
        provider: enrichment.provider,
        model: enrichment.model,
      },
    })
  }

  private parentConnect(kind: EnrichableDestinationKind, id: string): ParentConnect {
    switch (kind) {
      case 'ATTRACTION':
        return { attractionId: id }
      case 'RESTAURANT':
        return { restaurantId: id }
      case 'HOTEL':
        return { hotelId: id }
      case 'ACTIVITY':
        return { activityId: id }
    }
  }

  private async findAttractions(limit: number): Promise<EnrichableDestination[]> {
    const rows = await this.db.attraction.findMany({
      where: { deletedAt: null, enrichment: null },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { city: { include: { country: true } }, tags: true },
    })

    return rows.map((row) => ({
      id: row.id,
      kind: 'ATTRACTION',
      name: row.name,
      description: row.description,
      address: row.address,
      priceLevel: row.priceLevel,
      durationMinutes: row.durationMinutes,
      cityName: row.city.name,
      citySlug: row.city.slug,
      countryName: row.city.country.name,
      countrySlug: row.city.country.slug,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      slug: row.slug,
      sourceUrl: row.websiteUrl,
      tags: row.tags.map((tag) => tag.name),
    }))
  }

  private async findRestaurants(limit: number): Promise<EnrichableDestination[]> {
    const rows = await this.db.restaurant.findMany({
      where: { deletedAt: null, enrichment: null },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { city: { include: { country: true } }, tags: true },
    })

    return rows.map((row) => ({
      id: row.id,
      kind: 'RESTAURANT',
      name: row.name,
      description: row.description,
      address: row.address,
      category: 'restaurant',
      cuisines: row.cuisines,
      priceLevel: row.priceLevel,
      cityName: row.city.name,
      citySlug: row.city.slug,
      countryName: row.city.country.name,
      countrySlug: row.city.country.slug,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      slug: row.slug,
      sourceUrl: row.websiteUrl,
      tags: row.tags.map((tag) => tag.name),
    }))
  }

  private async findHotels(limit: number): Promise<EnrichableDestination[]> {
    const rows = await this.db.hotel.findMany({
      where: { deletedAt: null, enrichment: null },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { city: { include: { country: true } }, tags: true },
    })

    return rows.map((row) => ({
      id: row.id,
      kind: 'HOTEL',
      name: row.name,
      description: row.description,
      address: row.address,
      category: 'hotel',
      amenities: row.amenities,
      cityName: row.city.name,
      citySlug: row.city.slug,
      countryName: row.city.country.name,
      countrySlug: row.city.country.slug,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      slug: row.slug,
      sourceUrl: row.websiteUrl,
      tags: row.tags.map((tag) => tag.name),
    }))
  }

  private async findActivities(limit: number): Promise<EnrichableDestination[]> {
    const rows = await this.db.activity.findMany({
      where: { deletedAt: null, enrichment: null },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { city: { include: { country: true } }, tags: true },
    })

    return rows.map((row) => ({
      id: row.id,
      kind: 'ACTIVITY',
      name: row.name,
      description: row.description,
      address: row.address,
      category: row.category,
      priceLevel: row.priceLevel,
      durationMinutes: row.durationMinutes,
      cityName: row.city.name,
      citySlug: row.city.slug,
      countryName: row.city.country.name,
      countrySlug: row.city.country.slug,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      slug: row.slug,
      sourceUrl: row.websiteUrl,
      tags: row.tags.map((tag) => tag.name),
    }))
  }
}
