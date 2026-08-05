import { DestinationImportSource } from '@prisma/client'

import { slugify } from '@/import/normalization'
import { haversineDistanceKm, type GeoPoint, isValidGeoPoint } from '@/services/destinations/geo'
import type {
  DestinationCleanupDecision,
  DestinationCleanupRecord,
} from '@/services/destinations/types'

const BROAD_PAGE_TERMS = [
  ' is a country ',
  ' is a state ',
  ' is a city ',
  ' is a town ',
  ' is a satellite city ',
  ' is the state capital ',
  ' is the administrative capital ',
  ' is a district ',
  ' and district ',
  ' state capital of ',
]

export interface CleanupClassificationOptions {
  source?: DestinationImportSource
  city?: string
  citySlug?: string
  countrySlug?: string
  cityCenter?: GeoPoint
  reviewRadiusKm?: number
}

function sourceMatches(record: DestinationCleanupRecord, source?: DestinationImportSource): boolean {
  return !source || record.source === source
}

function cityMatches(record: DestinationCleanupRecord, city?: string): boolean {
  if (!city) return true
  const normalized = slugify(city)
  return record.citySlug === normalized || slugify(record.cityName) === normalized
}

export function readWikivoyageArticleSlug(value: string): string | null {
  try {
    const url = new URL(value)
    const marker = '/wiki/'
    const markerIndex = url.pathname.toLowerCase().indexOf(marker)
    if (markerIndex < 0) return null
    const title = decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
      .replace(/_/g, ' ')
      .replace(/#.*$/, '')
      .trim()
    return title ? slugify(title) : null
  } catch {
    const match = value.match(/\/wiki\/([^#?]+)/i)
    if (!match) return null
    return slugify(decodeURIComponent(match[1]).replace(/_/g, ' '))
  }
}

function hasBroadDescription(record: DestinationCleanupRecord): boolean {
  const description = ` ${(record.description ?? '').toLowerCase()} `
  return BROAD_PAGE_TERMS.some((term) => description.includes(term))
}

function isOutsideRequestedCity(
  record: DestinationCleanupRecord,
  cityCenter: GeoPoint | undefined,
  reviewRadiusKm: number
): boolean {
  if (!cityCenter || record.latitude == null || record.longitude == null) return false
  const point = { latitude: record.latitude, longitude: record.longitude }
  if (!isValidGeoPoint(point) || !isValidGeoPoint(cityCenter)) return false
  return haversineDistanceKm(point, cityCenter) > reviewRadiusKm
}

export function classifyLegacyCleanupRecord(
  record: DestinationCleanupRecord,
  options: CleanupClassificationOptions = {}
): DestinationCleanupDecision {
  if (!sourceMatches(record, options.source) || !cityMatches(record, options.city)) {
    return {
      record,
      recommendedAction: 'RETAIN',
      reasons: ['Outside cleanup command scope'],
      safeToApply: false,
    }
  }

  if (record.deletedAt) {
    return {
      record,
      recommendedAction: 'RETAIN',
      reasons: ['Already quarantined'],
      safeToApply: false,
    }
  }

  const reasons: string[] = []
  const articleSlug = readWikivoyageArticleSlug(record.sourceUrlOrIdentifier)

  if (record.source === DestinationImportSource.WIKIVOYAGE && articleSlug === record.slug) {
    reasons.push('WIKIVOYAGE_ARTICLE_PAGE_ENTITY')
  }
  if (options.citySlug && record.slug === options.citySlug) reasons.push('CITY_GUIDE')
  if (options.countrySlug && record.slug === options.countrySlug) reasons.push('REGION_PAGE')
  if (hasBroadDescription(record)) {
    reasons.push(record.slug === options.citySlug ? 'CITY_GUIDE' : 'REGION_PAGE')
  }
  if (isOutsideRequestedCity(record, options.cityCenter, options.reviewRadiusKm ?? 45)) {
    reasons.push('OUTSIDE_REQUESTED_CITY')
  }

  const isLegacyGuidePage =
    record.source === DestinationImportSource.WIKIVOYAGE &&
    (articleSlug === record.slug || reasons.includes('CITY_GUIDE') || reasons.includes('REGION_PAGE'))

  if (!isLegacyGuidePage) {
    return {
      record,
      recommendedAction: 'RETAIN',
      reasons: ['Does not match legacy broad guide-page criteria'],
      safeToApply: false,
    }
  }

  return {
    record,
    recommendedAction: 'QUARANTINE',
    reasons: [...new Set(reasons)],
    safeToApply: record.referencedByTripsOrItineraries.length === 0,
  }
}
