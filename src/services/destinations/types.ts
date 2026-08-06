import type {
  DestinationBudgetLevel,
  DestinationImportSource,
  DestinationSetting,
} from '@prisma/client'

export const DESTINATION_ENTITY_TYPES = ['ATTRACTION', 'RESTAURANT', 'HOTEL', 'ACTIVITY'] as const

export type DestinationEntityType = (typeof DESTINATION_ENTITY_TYPES)[number]

export type DestinationEntityTable = 'attractions' | 'restaurants' | 'hotels' | 'activities'

export type CandidateEnrichmentState = 'SOURCE_ONLY' | 'PARTIALLY_ENRICHED' | 'ENRICHED'

export type DestinationPriceConfidence = 'KNOWN_PRICE' | 'ESTIMATED_PRICE' | 'PRICE_UNKNOWN'

export type CandidateFactualStatus = 'VERIFIED' | 'PARTIAL' | 'STALE' | 'UNKNOWN'

export interface DestinationRetrievalQuery {
  cityId: string
  startDate?: Date
  endDate?: Date
  travelStyles?: string[]
  interests?: string[]
  budgetLevel?: string
  partyType?: string
  includeTypes?: DestinationEntityType[]
  limitPerType?: number
}

export type ItineraryReadinessDecision = 'ELIGIBLE' | 'BACKUP' | 'REVIEW' | 'INELIGIBLE'

export type DestinationDuplicateStatus =
  | 'EXACT_DUPLICATE'
  | 'SAME_PLACE_DIFFERENT_SOURCE'
  | 'SAME_BRAND_DIFFERENT_BRANCH'
  | 'POSSIBLE_DUPLICATE'
  | 'DISTINCT'

export interface DestinationPreferenceMatch {
  selectedPreferences: string[]
  strongMatches: string[]
  partialMatches: string[]
  unmatchedPreferences: string[]
  score: number
  reasons: string[]
}

export interface ItineraryReadiness {
  score: number
  decision: ItineraryReadinessDecision
  reasons: string[]
}

export interface DestinationOpeningHourContext {
  dayOfWeek: number
  opensAt?: string | null
  closesAt?: string | null
  isClosed: boolean
  note?: string | null
}

export interface DestinationTicketPriceContext {
  amount?: number
  minAmount?: number
  maxAmount?: number
  currency: string
  priceType: 'FIXED' | 'FROM' | 'RANGE' | 'FREE' | 'UNKNOWN'
  audience?: 'ADULT' | 'CHILD' | 'SENIOR' | 'STUDENT' | 'GENERAL'
  notes?: string
}

export interface DestinationFactSourceContext {
  factType: string
  sourceKey: string
  sourceTier: string
  status: CandidateFactualStatus
  retrievedAt: string
  verifiedAt?: string
  stale: boolean
  confidence: number
}

export interface DestinationEnrichmentContext {
  shortSummary: string
  bestFor: string[]
  hiddenGemScore: number
  photographyScore: number
  familyFriendly: boolean
  coupleFriendly: boolean
  kidsFriendly: boolean
  budgetLevel: DestinationBudgetLevel
  estimatedVisitDurationMinutes: number
  bestVisitingHours: string[]
  indoorOutdoor: DestinationSetting
  rainFriendly: boolean
  searchTags: string[]
  generatedAt: Date
}

export interface DestinationCandidate {
  candidateId: string
  id: string
  entityType: DestinationEntityType
  entityTable: DestinationEntityTable
  cityId: string
  cityName: string
  citySlug: string
  countryName: string
  countrySlug: string
  primaryName?: string
  localName?: string | null
  englishName?: string | null
  displayName?: string
  displayNameSource?: string
  name: string
  slug: string
  description?: string | null
  address?: string | null
  latitude: number
  longitude: number
  websiteUrl?: string | null
  source: DestinationImportSource
  sourceUrl?: string | null
  categories: string[]
  sourceCategories?: string[]
  tags: string[]
  openingHours: DestinationOpeningHourContext[]
  openingHoursStatus: CandidateFactualStatus
  priceLevel?: number | null
  ticketPrices: DestinationTicketPriceContext[]
  ticketPriceStatus: CandidateFactualStatus
  priceConfidence: DestinationPriceConfidence
  currency?: string | null
  officialUrl?: string | null
  officialUrlStatus: CandidateFactualStatus
  durationMinutes?: number | null
  lastVerifiedAt?: Date
  openingHoursKnown: boolean
  factualCompletenessScore: number
  staleFactCount: number
  factualStatus: CandidateFactualStatus
  factSourceSummary: DestinationFactSourceContext[]
  enrichmentState: CandidateEnrichmentState
  enrichment?: DestinationEnrichmentContext | null
  distanceFromCityCenterKm?: number
}

export interface RankedDestinationCandidate extends DestinationCandidate {
  rankScore: number
  rankReasons: string[]
  preferenceMatch?: DestinationPreferenceMatch
  itineraryReadiness?: ItineraryReadiness
  duplicateStatus?: DestinationDuplicateStatus
  penaltiesApplied?: string[]
  diversityReasons?: string[]
}

export interface DestinationCluster {
  id: string
  centerLatitude: number
  centerLongitude: number
  candidateIds: string[]
  averageRankScore: number
}

export interface DestinationNearestNeighbor {
  candidateId: string
  neighbors: Array<{
    candidateId: string
    distanceKm: number
  }>
}

export interface DestinationRetrievalResult {
  cityId: string
  candidates: RankedDestinationCandidate[]
  clusters: DestinationCluster[]
  nearestNeighbors: DestinationNearestNeighbor[]
}

export interface GeminiDestinationCandidateContext {
  id: string
  type: DestinationEntityType
  name: string
  primaryName?: string
  localName?: string | null
  englishName?: string | null
  displayNameSource?: string
  summary?: string
  latitude: number
  longitude: number
  address?: string
  categories: string[]
  tags: string[]
  openingHours: DestinationOpeningHourContext[]
  openingHoursStatus: CandidateFactualStatus
  ticketPrice?: {
    amount?: number
    minAmount?: number
    maxAmount?: number
    currency: string
    priceType?: DestinationTicketPriceContext['priceType']
    audience?: DestinationTicketPriceContext['audience']
    confidence: DestinationPriceConfidence
  }
  ticketPrices: DestinationTicketPriceContext[]
  ticketPriceStatus: CandidateFactualStatus
  priceConfidence: DestinationPriceConfidence
  openingHoursKnown: boolean
  officialUrl?: string
  officialUrlStatus: CandidateFactualStatus
  estimatedVisitDurationMinutes?: number
  source: string
  lastVerifiedAt?: string
  factualCompletenessScore: number
  staleFactCount: number
  factualStatus: CandidateFactualStatus
  factSourceSummary: DestinationFactSourceContext[]
  rankScore: number
  rankReasons: string[]
  enrichmentState: CandidateEnrichmentState
}

export interface GeminiDestinationContext {
  cityId: string
  candidates: GeminiDestinationCandidateContext[]
  clusters: DestinationCluster[]
  nearestNeighbors: DestinationNearestNeighbor[]
  candidateCount: number
  omittedCandidateCount: number
  serializedSize: number
  maxSerializedSize: number
}

export interface DestinationCleanupReference {
  id: string
  title: string
}

export type DestinationCleanupAction = 'RETAIN' | 'QUARANTINE' | 'DELETE' | 'RECLASSIFY'

export interface DestinationCleanupRecord {
  id: string
  name: string
  slug: string
  entityType: DestinationEntityType
  entityTable: DestinationEntityTable
  source: DestinationImportSource
  sourceUrlOrIdentifier: string
  cityId: string
  cityName: string
  citySlug: string
  countryName: string
  countrySlug: string
  latitude: number | null
  longitude: number | null
  description?: string | null
  deletedAt?: Date | null
  enrichmentId?: string | null
  referencedByTripsOrItineraries: DestinationCleanupReference[]
}

export interface DestinationCleanupDecision {
  record: DestinationCleanupRecord
  recommendedAction: DestinationCleanupAction
  reasons: string[]
  safeToApply: boolean
}

export interface DestinationCleanupCounts {
  attractions: number
  restaurants: number
  hotels: number
  activities: number
}

export interface DestinationCleanupSummary {
  mode: 'dry-run' | 'apply'
  beforeCounts: DestinationCleanupCounts
  afterCounts: DestinationCleanupCounts
  inspectedRecords: number
  affectedRecords: number
  decisions: DestinationCleanupDecision[]
}
