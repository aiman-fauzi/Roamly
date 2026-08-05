export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

export type StructuredPriceType = 'FIXED' | 'FROM' | 'RANGE' | 'FREE' | 'UNKNOWN'

export type StructuredPriceAudience = 'ADULT' | 'CHILD' | 'SENIOR' | 'STUDENT' | 'GENERAL'

export type FactSourceTier =
  | 'OFFICIAL_SOURCE'
  | 'GOVERNMENT_OPEN_DATA'
  | 'OPENSTREETMAP_STRUCTURED'
  | 'TRUSTED_TRAVEL_LISTING'
  | 'GEMINI_DERIVED'

export type DestinationFactKind =
  | 'TICKET_PRICE'
  | 'OPENING_HOURS'
  | 'ADDRESS'
  | 'COORDINATES'
  | 'DESCRIPTION_TAGS'
  | 'OFFICIAL_URL'
  | 'OPERATIONAL_STATUS'
  | 'VISIT_DURATION'

export type FactParseStatus = 'PARSED' | 'PARTIAL' | 'AMBIGUOUS' | 'UNSUPPORTED'

export interface DestinationFactProvenance {
  sourceName: string
  sourceUrl: string
  sourceRecordId?: string
  retrievedAt: string
  verifiedAt?: string
  rawValue: unknown
  normalizedValue: unknown
  parserVersion: string
  sourceTier: FactSourceTier
}

export interface StructuredOpeningHours {
  timezone?: string
  weekly: Array<{
    day: Weekday
    intervals: Array<{
      opens: string
      closes: string
    }>
    closed?: boolean
  }>
  notes?: string
  sourceUrl?: string
  verifiedAt?: string
  provenance?: DestinationFactProvenance
}

export interface StructuredOpeningHoursParseResult {
  status: FactParseStatus
  value?: StructuredOpeningHours
  rawValue: string
  reason?: string
}

export interface StructuredPrice {
  amount?: number
  minAmount?: number
  maxAmount?: number
  currency: string
  priceType: StructuredPriceType
  audience?: StructuredPriceAudience
  sourceUrl?: string
  verifiedAt?: string
  provenance?: DestinationFactProvenance
}

export interface StructuredPriceParseResult {
  status: FactParseStatus
  values: StructuredPrice[]
  rawValue: string
  reason?: string
}

export type OperationalStatus = 'OPEN' | 'TEMPORARILY_CLOSED' | 'PERMANENTLY_CLOSED' | 'UNKNOWN'

export interface DestinationFactFetchInput {
  url: string
  sourceRecordId?: string
}

export interface DestinationFactFetchResult {
  sourceKey: string
  officialUrl?: string
  address?: {
    value: string
    provenance: DestinationFactProvenance
  }
  openingHours?: StructuredOpeningHours
  ticketPrices?: StructuredPrice[]
  operationalStatus?: {
    value: OperationalStatus
    provenance: DestinationFactProvenance
  }
  retrievedAt: string
  provenance: DestinationFactProvenance[]
}

export interface DestinationFactSourceAdapter {
  sourceKey: string
  supports(url: string): boolean
  fetch(input: DestinationFactFetchInput): Promise<DestinationFactFetchResult>
}
