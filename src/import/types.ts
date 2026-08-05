import type { DestinationImportSource } from '@prisma/client'

export type DestinationKind = 'ATTRACTION' | 'RESTAURANT' | 'HOTEL' | 'ACTIVITY'

export type DestinationRelevanceStatus = 'ACCEPT' | 'REVIEW' | 'REJECT'

export type DestinationDuplicateStatus = 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'DISTINCT'

export type DestinationRejectionReason =
  | 'AIRPORT_PAGE'
  | 'BORDERLINE_CITY_DISTANCE'
  | 'CATEGORY_PAGE'
  | 'CITY_GUIDE'
  | 'DISAMBIGUATION_PAGE'
  | 'DISTRICT_PAGE'
  | 'DUPLICATE_SOURCE_RECORD'
  | 'GENERAL_ARTICLE'
  | 'INVALID_COORDINATES'
  | 'ITINERARY_ARTICLE'
  | 'LOW_RELEVANCE_SCORE'
  | 'MISSING_COORDINATES'
  | 'MISSING_NAME'
  | 'OUTSIDE_REQUESTED_CITY'
  | 'POSSIBLE_DUPLICATE'
  | 'REGION_PAGE'
  | 'TRANSPORT_PAGE'
  | 'UNKNOWN_ENTITY_TYPE'
  | 'UNSUPPORTED_ENTITY_TYPE'

export interface DestinationRelevance {
  requestedCountry?: string
  requestedCity?: string
  detectedCountry?: string
  detectedCity?: string
  geographicDistanceKm?: number
  geographicConfidence: number
  entityConfidence: number
  sourceConfidence: number
  relevanceScore: number
  duplicateStatus: DestinationDuplicateStatus
  status: DestinationRelevanceStatus
  rejectionReasons: DestinationRejectionReason[]
}

export interface ImportSourceConfig {
  source: DestinationImportSource
  sourceKey: string
  url: string
  countryName?: string
  countrySlug?: string
  countryCode?: string
  countryIso3?: string
  currencyCode?: string
  phoneCode?: string
  citySlug?: string
  cityName?: string
  defaultKind?: DestinationKind
  batchSize?: number
  requestTimeoutMs?: number
}

export interface RawDestinationRecord {
  source: DestinationImportSource
  sourceId: string
  name?: string
  kind?: DestinationKind
  description?: string
  address?: string
  latitude?: number
  longitude?: number
  cityName?: string
  citySlug?: string
  countryName?: string
  countrySlug?: string
  countryCode?: string
  countryIso3?: string
  currencyCode?: string
  phoneCode?: string
  sourceUrl?: string
  websiteUrl?: string
  phone?: string
  priceLevel?: number
  durationMinutes?: number
  category?: string
  cuisines?: string[]
  amenities?: string[]
  tags?: string[]
  images?: Array<{
    url: string
    altText?: string
    caption?: string
    attribution?: string
    isPrimary?: boolean
  }>
  openingHours?: Array<{
    dayOfWeek: number
    opensAt?: string
    closesAt?: string
    isClosed?: boolean
    note?: string
  }>
  raw?: unknown
}

export interface NormalizedDestinationRecord {
  source: DestinationImportSource
  sourceId: string
  kind: DestinationKind
  name: string
  slug: string
  description?: string
  address?: string
  latitude: number
  longitude: number
  cityName?: string
  citySlug?: string
  countryName?: string
  countrySlug?: string
  countryCode?: string
  countryIso3?: string
  currencyCode?: string
  phoneCode?: string
  sourceUrl?: string
  websiteUrl?: string
  phone?: string
  priceLevel?: number
  durationMinutes?: number
  category?: string
  cuisines: string[]
  amenities: string[]
  tags: string[]
  images: Array<{
    url: string
    altText?: string
    caption?: string
    attribution?: string
    isPrimary: boolean
  }>
  openingHours: Array<{
    dayOfWeek: number
    opensAt?: string
    closesAt?: string
    isClosed: boolean
    note?: string
  }>
  fingerprint: string
  relevance?: DestinationRelevance
}

export interface DestinationRecordRejection {
  sourceId?: string
  name?: string
  status: DestinationRelevanceStatus
  rejectionReasons: DestinationRejectionReason[]
  relevanceScore?: number
  geographicDistanceKm?: number
}

export interface DestinationParser {
  parse(payload: string, config: ImportSourceConfig): RawDestinationRecord[]
}

export interface ImportRecordResult {
  status: 'created' | 'updated' | 'skipped'
  reason?: string
}

export interface DestinationImportSummary {
  jobId: string
  status: 'COMPLETED' | 'FAILED'
  fetchedRecords: number
  normalizedRecords: number
  acceptedRecords: number
  reviewRecords: number
  rejectedRecords: number
  createdRecords: number
  updatedRecords: number
  totalRecords: number
  processedRecords: number
  skippedRecords: number
  failedRecords: number
}
