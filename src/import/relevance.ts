import { DestinationImportSource } from '@prisma/client'

import { haversineDistanceMeters, slugify } from '@/import/normalization'
import type {
  DestinationDuplicateStatus,
  DestinationRejectionReason,
  DestinationRelevance,
  DestinationRelevanceStatus,
  ImportSourceConfig,
  NormalizedDestinationRecord,
} from '@/import/types'

export interface CityRelevancePolicy {
  centerLatitude: number
  centerLongitude: number
  strictRadiusKm: number
  reviewRadiusKm: number
}

export interface RelevanceThresholds {
  accept: number
  review: number
}

const DEFAULT_THRESHOLDS: RelevanceThresholds = {
  accept: 80,
  review: 55,
}

const CITY_RELEVANCE_POLICIES: Record<string, CityRelevancePolicy> = {
  'malaysia:kuala-lumpur': {
    centerLatitude: 3.1394,
    centerLongitude: 101.6893,
    strictRadiusKm: 25,
    reviewRadiusKm: 45,
  },
}

const HARD_REJECT_REASONS = new Set<DestinationRejectionReason>([
  'AIRPORT_PAGE',
  'CATEGORY_PAGE',
  'CITY_GUIDE',
  'DISAMBIGUATION_PAGE',
  'DISTRICT_PAGE',
  'GENERAL_ARTICLE',
  'INVALID_COORDINATES',
  'ITINERARY_ARTICLE',
  'MISSING_COORDINATES',
  'MISSING_NAME',
  'OUTSIDE_REQUESTED_CITY',
  'REGION_PAGE',
  'TRANSPORT_PAGE',
  'UNKNOWN_ENTITY_TYPE',
  'UNSUPPORTED_ENTITY_TYPE',
])

function readPolicy(config: ImportSourceConfig): CityRelevancePolicy | undefined {
  if (!config.countrySlug || !config.citySlug) return undefined
  return CITY_RELEVANCE_POLICIES[`${config.countrySlug}:${config.citySlug}`]
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

function isWikivoyageListing(record: NormalizedDestinationRecord): boolean {
  return record.tags.includes('wikivoyage:listing')
}

function classifyPageReasons(
  record: NormalizedDestinationRecord,
  config: ImportSourceConfig
): DestinationRejectionReason[] {
  const title = record.name.toLowerCase()
  const slug = record.slug
  const description = record.description?.toLowerCase() ?? ''
  const category = record.category?.toLowerCase() ?? ''
  const sourceUrl = (record.sourceUrl ?? record.websiteUrl ?? '').toLowerCase()
  const combined = `${title} ${description} ${category} ${sourceUrl}`
  const reasons: DestinationRejectionReason[] = []

  if (sourceUrl.includes('/wiki/category:') || title.startsWith('category:')) {
    reasons.push('CATEGORY_PAGE')
  }
  if (includesAny(combined, ['disambiguation'])) reasons.push('DISAMBIGUATION_PAGE')
  if (includesAny(combined, [' itinerary', ' itineraries', ' walking tour'])) {
    reasons.push('ITINERARY_ARTICLE')
  }
  if (includesAny(combined, [' airport', 'terminal '])) reasons.push('AIRPORT_PAGE')
  if (includesAny(combined, [' railway ', ' train ', ' station ', ' transport', 'transit'])) {
    reasons.push('TRANSPORT_PAGE')
  }
  if (config.citySlug && slug === config.citySlug) reasons.push('CITY_GUIDE')
  if (config.countrySlug && slug === config.countrySlug) reasons.push('REGION_PAGE')
  if (
    includesAny(description, [
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
    ])
  ) {
    reasons.push(slug === config.citySlug ? 'CITY_GUIDE' : 'REGION_PAGE')
  }

  if (
    record.source === DestinationImportSource.WIKIVOYAGE &&
    !isWikivoyageListing(record) &&
    reasons.length === 0
  ) {
    reasons.push('GENERAL_ARTICLE')
  }

  return [...new Set(reasons)]
}

function entityConfidence(record: NormalizedDestinationRecord, reasons: DestinationRejectionReason[]): number {
  if (reasons.some((reason) => HARD_REJECT_REASONS.has(reason))) return 0
  if (record.source === DestinationImportSource.OPENSTREETMAP) return 92
  if (record.source === DestinationImportSource.GOVERNMENT_TOURISM) return 82
  if (record.source === DestinationImportSource.WIKIVOYAGE && isWikivoyageListing(record)) return 88
  if (record.source === DestinationImportSource.WIKIPEDIA) return 45
  return 40
}

function sourceConfidence(record: NormalizedDestinationRecord): number {
  if (record.source === DestinationImportSource.OPENSTREETMAP) return 90
  if (record.source === DestinationImportSource.GOVERNMENT_TOURISM) return 78
  if (record.source === DestinationImportSource.WIKIVOYAGE && isWikivoyageListing(record)) return 85
  if (record.source === DestinationImportSource.WIKIVOYAGE) return 40
  if (record.source === DestinationImportSource.WIKIPEDIA) return 35
  return 30
}

function geographicConfidence(
  record: NormalizedDestinationRecord,
  config: ImportSourceConfig,
  reasons: DestinationRejectionReason[]
): { confidence: number; distanceKm?: number } {
  const policy = readPolicy(config)
  const cityMatches =
    Boolean(record.citySlug && config.citySlug && record.citySlug === config.citySlug) ||
    Boolean(record.cityName && config.cityName && slugify(record.cityName) === slugify(config.cityName))

  if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) {
    reasons.push('MISSING_COORDINATES')
    return { confidence: cityMatches ? 35 : 0 }
  }

  if (!policy) {
    return { confidence: cityMatches ? 70 : 45 }
  }

  const distanceKm =
    haversineDistanceMeters(
      record.latitude,
      record.longitude,
      policy.centerLatitude,
      policy.centerLongitude
    ) / 1000

  if (distanceKm <= policy.strictRadiusKm) return { confidence: 100, distanceKm }
  if (distanceKm <= policy.reviewRadiusKm) {
    reasons.push('BORDERLINE_CITY_DISTANCE')
    return { confidence: 55, distanceKm }
  }

  reasons.push('OUTSIDE_REQUESTED_CITY')
  return { confidence: 0, distanceKm }
}

function fieldConfidence(record: NormalizedDestinationRecord): number {
  let score = 35
  if (record.description) score += 15
  if (record.address) score += 15
  if (record.websiteUrl) score += 10
  if (Number.isFinite(record.latitude) && Number.isFinite(record.longitude)) score += 25
  return Math.min(score, 100)
}

function computeStatus(
  score: number,
  duplicateStatus: DestinationDuplicateStatus,
  reasons: DestinationRejectionReason[],
  thresholds: RelevanceThresholds
): DestinationRelevanceStatus {
  if (duplicateStatus === 'EXACT_DUPLICATE') return 'REJECT'
  if (duplicateStatus === 'POSSIBLE_DUPLICATE') return 'REVIEW'
  if (reasons.some((reason) => HARD_REJECT_REASONS.has(reason))) return 'REJECT'
  if (score >= thresholds.accept) return 'ACCEPT'
  if (score >= thresholds.review) return 'REVIEW'
  return 'REJECT'
}

function scoreRecord(
  record: NormalizedDestinationRecord,
  config: ImportSourceConfig,
  duplicateStatus: DestinationDuplicateStatus,
  thresholds: RelevanceThresholds
): DestinationRelevance {
  const rejectionReasons = classifyPageReasons(record, config)
  const geographic = geographicConfidence(record, config, rejectionReasons)
  const entity = entityConfidence(record, rejectionReasons)
  const source = sourceConfidence(record)
  const fields = fieldConfidence(record)
  let relevanceScore = Math.round(entity * 0.4 + geographic.confidence * 0.35 + source * 0.15 + fields * 0.1)

  if (duplicateStatus === 'POSSIBLE_DUPLICATE') rejectionReasons.push('POSSIBLE_DUPLICATE')
  if (duplicateStatus === 'EXACT_DUPLICATE') rejectionReasons.push('DUPLICATE_SOURCE_RECORD')

  const status = computeStatus(relevanceScore, duplicateStatus, rejectionReasons, thresholds)
  if (status === 'REJECT' && relevanceScore > thresholds.review && rejectionReasons.some((reason) => HARD_REJECT_REASONS.has(reason))) {
    relevanceScore = Math.min(relevanceScore, thresholds.review - 1)
  }
  if (status === 'REJECT' && !rejectionReasons.length) rejectionReasons.push('LOW_RELEVANCE_SCORE')

  return {
    requestedCountry: config.countryName,
    requestedCity: config.cityName,
    detectedCountry: record.countryName,
    detectedCity: record.cityName,
    geographicDistanceKm: geographic.distanceKm,
    geographicConfidence: geographic.confidence,
    entityConfidence: entity,
    sourceConfidence: source,
    relevanceScore,
    duplicateStatus,
    status,
    rejectionReasons: [...new Set(rejectionReasons)],
  }
}

function distanceKm(first: NormalizedDestinationRecord, second: NormalizedDestinationRecord): number {
  return (
    haversineDistanceMeters(first.latitude, first.longitude, second.latitude, second.longitude) / 1000
  )
}

function duplicateStatus(
  candidate: NormalizedDestinationRecord,
  previous: NormalizedDestinationRecord[]
): DestinationDuplicateStatus {
  for (const record of previous) {
    const sameCity = (candidate.citySlug ?? '') === (record.citySlug ?? '')
    const sameKind = candidate.kind === record.kind
    if (!sameCity || !sameKind) continue

    if (candidate.source === record.source && candidate.sourceId === record.sourceId) {
      return 'EXACT_DUPLICATE'
    }
    if (candidate.slug === record.slug && distanceKm(candidate, record) < 0.2) {
      return 'EXACT_DUPLICATE'
    }
    if (distanceKm(candidate, record) < 0.15) {
      return 'POSSIBLE_DUPLICATE'
    }
    if (
      (candidate.slug.includes(record.slug) || record.slug.includes(candidate.slug)) &&
      distanceKm(candidate, record) < 0.5
    ) {
      return 'POSSIBLE_DUPLICATE'
    }
  }

  return 'DISTINCT'
}

export function evaluateDestinationRecords(
  records: NormalizedDestinationRecord[],
  config: ImportSourceConfig,
  thresholds: RelevanceThresholds = DEFAULT_THRESHOLDS
): NormalizedDestinationRecord[] {
  const previous: NormalizedDestinationRecord[] = []

  return records.map((record) => {
    const status = duplicateStatus(record, previous)
    const evaluated = {
      ...record,
      relevance: scoreRecord(record, config, status, thresholds),
    }

    if (evaluated.relevance.duplicateStatus !== 'EXACT_DUPLICATE') {
      previous.push(evaluated)
    }

    return evaluated
  })
}
