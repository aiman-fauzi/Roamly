import type { DestinationFactEntityType } from '@prisma/client'

import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'

export type DestinationImportProviderId =
  | 'openstreetmap-overpass'
  | 'wikidata'
  | 'wikimedia-commons'
  | 'wikivoyage'
  | 'government-tourism-open-data'

export type DestinationImportStage =
  | 'discover'
  | 'normalize'
  | 'validate'
  | 'deduplicate'
  | 'enrich'
  | 'score'
  | 'stage'
  | 'upsert'
  | 'report'

export type DestinationImportCategory =
  | 'landmark'
  | 'museum'
  | 'gallery'
  | 'viewpoint'
  | 'zoo'
  | 'aquarium'
  | 'theme_park'
  | 'artwork'
  | 'historic'
  | 'heritage'
  | 'beach'
  | 'peak'
  | 'waterfall'
  | 'park'
  | 'nature_reserve'
  | 'place_of_worship'
  | 'market'
  | 'cultural_venue'
  | 'other'

export type ImportValidationStatus = 'accepted' | 'review' | 'rejected'

export type ImportValidationReason =
  | 'SOURCE_NOT_REGISTERED'
  | 'SOURCE_DISABLED'
  | 'SOURCE_LICENSE_MISSING'
  | 'SOURCE_COMMERCIAL_REUSE_DISALLOWED'
  | 'SOURCE_HTML_SCRAPING_DISABLED'
  | 'MISSING_NAME'
  | 'MISSING_SOURCE_RECORD_ID'
  | 'MISSING_COORDINATES'
  | 'INVALID_COORDINATES'
  | 'OUT_OF_BOUNDS'
  | 'UNSUPPORTED_CATEGORY'
  | 'GENERIC_NAME'
  | 'LOW_IDENTITY_SIGNAL'
  | 'CHAIN_OR_GENERIC_BUSINESS'
  | 'TRANSPORT_ONLY'
  | 'DUPLICATE_SOURCE_RECORD'
  | 'PROBABLE_DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | 'CONFLICTING_LOCALITY'
  | 'IMAGE_LICENSE_UNSUPPORTED'
  | 'IMAGE_ATTRIBUTION_INCOMPLETE'
  | 'ENRICHMENT_COORDINATE_MISMATCH'
  | 'MALFORMED_PROVIDER_RESPONSE'
  | 'PROVIDER_FAILURE'
  | 'LOW_IMPORT_READINESS'

export type DuplicateDecision =
  | 'new'
  | 'exact_duplicate'
  | 'probable_duplicate'
  | 'possible_duplicate'
  | 'conflict'

export type DestinationEnglishNameSource =
  | 'osm:name:en'
  | 'wikidata:en-label'
  | 'wikipedia:en-title'
  | 'official-structured-source'

export interface DestinationNames {
  primary: string
  local: string | null
  english: string | null
  aliases: string[]
  languages: Record<string, string>
}

export interface LicensedImageAttribution {
  imageUrl: string
  imagePageUrl: string
  imageAuthor: string
  imageLicense: string
  imageLicenseUrl: string
  imageAttribution: string
  sourceRecordId: string
}

export interface NormalizedDestinationCandidate {
  sourceId: DestinationImportProviderId
  sourceRecordId: string
  sourceUrl: string | null
  sourceObjectType: string | null

  name: string
  names: DestinationNames
  normalizedName: string
  aliases: string[]
  nameIdentityKeys: string[]

  countryCode: string
  countryName: string
  countrySlug: string
  destinationSlug: string
  locality: string | null
  administrativeArea: string | null

  latitude: number
  longitude: number

  category: DestinationImportCategory
  subcategories: string[]
  rawTags: Record<string, unknown>

  shortDescription: string | null
  websiteUrl: string | null
  phoneNumber: string | null
  openingHoursRaw: string | null

  wikidataId: string | null
  wikipediaUrl: string | null
  commonsCategory: string | null
  englishNameSource: DestinationEnglishNameSource | null

  imageUrl: string | null
  imagePageUrl: string | null
  imageAuthor: string | null
  imageLicense: string | null
  imageLicenseUrl: string | null
  imageAttribution: string | null

  contentLicense: string | null
  contentAttribution: string | null

  discoveredAt: Date
  sourceUpdatedAt: Date | null
  rawSourcePayload?: unknown
}

export interface DestinationCandidateEnrichment {
  wikidataId?: string | null
  wikipediaUrl?: string | null
  commonsCategory?: string | null
  officialWebsite?: string | null
  aliases?: string[]
  image?: LicensedImageAttribution | null
  validationReasons: ImportValidationReason[]
}

export interface DestinationImportReadiness {
  score: number
  status: ImportValidationStatus
  reasons: ImportValidationReason[]
}

export interface DestinationImportQualityScores {
  importReadiness: number
  identityConfidence: number
  tourismRelevance: number
  itineraryUsefulness: number
  localityConfidence: number
  duplicateRisk: number
  enrichmentCompleteness: number
}

export interface DestinationImportCandidateDecision {
  candidate: NormalizedDestinationCandidate
  validationStatus: ImportValidationStatus
  validationReasons: ImportValidationReason[]
  duplicateDecision: DuplicateDecision
  duplicateConfidence: number
  duplicateOf?: string
  duplicateDiagnostic?: DuplicateDiagnostic
  importReadiness: DestinationImportReadiness
  qualityScores: DestinationImportQualityScores
  qualityReviewReasons: string[]
  proposedAction: 'insert' | 'update' | 'skip' | 'review'
  proposedFieldChanges?: DestinationImportFieldChange[]
  protectedFields?: DestinationImportFieldProtection[]
}

export interface ExistingDestinationForDeduplication {
  entityType: DestinationFactEntityType
  entityId: string
  name: string
  slug: string
  nameIdentityKeys?: string[]
  latitude: number | null
  longitude: number | null
  description?: string | null
  address?: string | null
  websiteUrl?: string | null
  phone?: string | null
  sourceRecordIds?: string[]
  wikidataIds?: string[]
  wikipediaUrls?: string[]
  manuallyCurated?: boolean
  providerManaged?: boolean
  importConfidence?: number | null
}

export interface DuplicateDiagnostic {
  candidateSourceRecordId: string
  candidateName: string
  matchedSourceRecordId: string | null
  matchedEntityId: string | null
  matchedName: string | null
  matchedFields: string[]
  geographicDistanceMeters: number | null
  confidenceScore: number
  decision: DuplicateDecision
  mergeTarget: string | null
}

export interface DestinationImportFieldChange {
  field: string
  currentValue: unknown
  proposedValue: unknown
  reason: string
}

export interface DestinationImportFieldProtection {
  field: string
  currentValue: unknown
  proposedValue: unknown
  reason: string
}

export interface DestinationImportCoverage {
  count: number
  total: number
  percent: number
}

export interface DestinationImportSummaryBuckets {
  discovered: number
  normalized: number
  acceptedNew: number
  manualReview: number
  rejectedNew: number
  existingExactMatches: number
  existingNoChange: number
  safeUpdates: number
  probableDuplicates: number
  possibleDuplicates: number
  conflicts: number
  inserted: number
  updated: number
  skipped: number
  failed: number
}

export interface DestinationImportPipelineOptions {
  area: DestinationImportArea
  provider: 'osm'
  limit: number
  dryRun: boolean
  commit: boolean
  enrich: boolean
  maxEnrichmentRecords: number
  maxRequests: number
  manifest?: DestinationImportPilotManifest | null
}

export interface DestinationImportPilotManifestCandidate {
  sourceId: string
  sourceProvider?: string
  sourceRecordId?: string
  name: string
  localName: string | null
  englishName: string | null
  englishNameSource?: DestinationEnglishNameSource | null
  category: string
  subcategories?: string[]
  latitude: number
  longitude: number
  wikidataId: string | null
  websiteUrl?: string | null
  sourceUrl: string | null
  duplicateDecision: string
  existingAttractionId?: string | null
  importReadinessScore?: number
  identityConfidence?: number
  tourismRelevanceScore?: number
  itineraryUsefulnessScore?: number
  localityConfidence?: number
  duplicateRiskScore?: number
  imageUrl?: string | null
  imagePageUrl?: string | null
  imageAuthor?: string | null
  imageLicenseUrl?: string | null
  imageAttribution?: string | null
  proposedAction: 'insert' | 'update' | 'skip' | 'manual_review'
  updateTargetId: string | null
  protectedFields: string[]
  imageLicense: string | null
  reviewReasons?: string[]
  selectionReason?: string[]
  contentHash?: string
}

export interface DestinationImportPilotManifest {
  manifestVersion?: string
  areaSlug: string
  provider: 'osm'
  limit: number
  requestedLimit?: number
  dryRunJobId?: string
  sourceDryRunReportPath?: string
  createdAt: string
  candidateCount?: number
  checksumAlgorithm?: string
  candidateSetChecksum?: string
  candidates: DestinationImportPilotManifestCandidate[]
}

export interface DestinationImportPipelineReport {
  jobId: string
  area: Pick<DestinationImportArea, 'slug' | 'name' | 'countryCode' | 'countryName' | 'areaType'>
  provider: 'osm'
  dryRun: boolean
  stages: DestinationImportStage[]
  summary: DestinationImportSummaryBuckets
  requestCount: number
  discoveredCount: number
  normalizedCount: number
  acceptedCount: number
  reviewCount: number
  rejectedCount: number
  duplicateCount: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  failedCount: number
  categoryDistribution: Record<string, number>
  osmObjectTypeDistribution: Record<string, number>
  rejectionReasonDistribution: Record<string, number>
  reviewReasonDistribution: Record<string, number>
  duplicateDecisionDistribution: Record<string, number>
  localNameOnlyCount: number
  englishNameCoverage: DestinationImportCoverage
  wikidataCoverage: DestinationImportCoverage
  websiteCoverage: DestinationImportCoverage
  imageCoverage: DestinationImportCoverage
  licensedImageCoverage: DestinationImportCoverage
  outsideBoundaryCandidates: Array<{ sourceRecordId: string; name: string; latitude: number; longitude: number }>
  ambiguousLocalityCandidates: Array<{ sourceRecordId: string; name: string; locality: string | null }>
  multipleStrongIdentitySignalCandidates: Array<{ sourceRecordId: string; name: string; signals: string[] }>
  candidateSourceIds: string[]
  localityMismatches: Array<{ sourceRecordId: string; name: string; locality: string | null }>
  missingSourceIds: Array<{ name: string }>
  unsupportedCategories: Array<{ sourceRecordId: string; name: string; category: string }>
  imageLicenseFailures: Array<{ sourceRecordId: string; name: string; reasons: ImportValidationReason[] }>
  proposedInserts: Array<{ sourceRecordId: string; name: string; category: string; score: number }>
  proposedUpdates: Array<{
    sourceRecordId: string
    name: string
    duplicateOf: string
    score: number
    fieldsThatWouldChange: DestinationImportFieldChange[]
    fieldsProtected: DestinationImportFieldProtection[]
  }>
  acceptedExamples: DestinationImportCandidateDecision[]
  reviewExamples: DestinationImportCandidateDecision[]
  rejectedExamples: DestinationImportCandidateDecision[]
  duplicateDiagnostics: DestinationImportCandidateDecision[]
  decisions: DestinationImportCandidateDecision[]
  diagnosticsFilePath: string | null
  startedAt: string
  completedAt: string
  errorSummary: string | null
}
