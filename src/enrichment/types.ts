import type { DestinationBudgetLevel, DestinationSetting } from '@prisma/client'

export type EnrichableDestinationKind = 'ATTRACTION' | 'RESTAURANT' | 'HOTEL' | 'ACTIVITY'

export interface EnrichableDestination {
  id: string
  kind: EnrichableDestinationKind
  name: string
  description: string | null
  address: string | null
  category?: string | null
  cuisines?: string[]
  amenities?: string[]
  priceLevel?: number | null
  durationMinutes?: number | null
  cityName: string
  citySlug?: string
  countryName: string
  countrySlug?: string
  latitude: number | null
  longitude: number | null
  slug?: string
  sourceUrl?: string | null
  tags: string[]
}

export interface DestinationEnrichmentData {
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
}

export interface GeneratedDestinationEnrichment extends DestinationEnrichmentData {
  provider: string
  model: string
}

export interface DestinationEnrichmentProvider {
  generate(destination: EnrichableDestination): Promise<GeneratedDestinationEnrichment>
}

export interface DestinationEnrichmentJobSummary {
  jobId: string
  status: 'COMPLETED' | 'FAILED'
  processedRecords: number
  skippedRecords: number
  failedRecords: number
}
