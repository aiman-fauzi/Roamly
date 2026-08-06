import {
  DestinationFactEntityType,
  DestinationFactType,
  DestinationImportSource,
  type DestinationBudgetLevel,
  type DestinationSetting,
  type PrismaClient,
} from '@prisma/client'

import { prisma } from '@/db/client'
import { slugify } from '@/import/normalization'
import {
  destinationFactKey,
  DestinationFactService,
  type EffectiveDestinationFact,
} from '@/services/destinations/facts/destinationFactService'
import { evaluateFactStaleness } from '@/services/destinations/facts/staleness'
import {
  buildNearestNeighbors,
  groupNearbyCandidates,
  haversineDistanceKm,
  isValidGeoPoint,
  type GeoPoint,
} from '@/services/destinations/geo'
import { readWikivoyageArticleSlug } from '@/services/destinations/legacyCleanup'
import {
  primaryRetrievalCategory,
  retrievalCategoriesForDestination,
  selectDestinationDisplayName,
} from '@/services/destinations/retrievalTaxonomy'
import type {
  CandidateEnrichmentState,
  CandidateFactualStatus,
  DestinationCandidate,
  DestinationDuplicateStatus,
  DestinationEntityType,
  DestinationFactSourceContext,
  DestinationOpeningHourContext,
  DestinationPreferenceMatch,
  DestinationPriceConfidence,
  DestinationTicketPriceContext,
  DestinationRetrievalQuery,
  DestinationRetrievalResult,
  ItineraryReadiness,
  RankedDestinationCandidate,
} from '@/services/destinations/types'

const DEFAULT_LIMIT_PER_TYPE = 8
const DEFAULT_CLUSTER_RADIUS_KM = 2
const DEFAULT_MIN_ELIGIBLE_CANDIDATES = 6

const KNOWN_CITY_CENTERS: Record<string, GeoPoint> = {
  'malaysia:kuala-lumpur': { latitude: 3.1394, longitude: 101.6893 },
}

const PREFERENCE_INTENT_TERMS: Record<string, string[]> = {
  sightseeing: [
    'landmark',
    'viewpoint',
    'heritage',
    'architecture',
    'city icon',
    'cultural site',
    'see',
    'sightseeing',
  ],
  museums: ['museum', 'gallery', 'exhibition', 'cultural centre', 'cultural center'],
  history: ['history', 'historic', 'heritage', 'monument', 'memorial'],
  religious: [
    'religious',
    'temple',
    'shrine',
    'mosque',
    'church',
    'place of worship',
    'place_of_worship',
  ],
  market: ['market', 'marketplace', 'night market', 'shopping', 'local food'],
  night_market: ['night market', 'evening market', 'street food', 'local food', 'nightlife'],
  family: ['family', 'kids', 'children', 'aquarium', 'zoo', 'theme park', 'safari'],
  landmark: ['landmark', 'iconic', 'city icon', 'historic', 'heritage'],
  entertainment: ['entertainment', 'aquarium', 'zoo', 'theme park', 'theatre', 'show', 'cable car'],
  nature: [
    'nature',
    'park',
    'garden',
    'viewpoint',
    'beach',
    'waterfall',
    'peak',
    'national park',
    'island',
  ],
  beach: ['beach', 'coast', 'island', 'waterfront', 'seaside'],
  island: ['island', 'islands', 'hon thom', 'boat', 'snorkeling'],
  national_park: ['national park', 'nature reserve', 'forest', 'hiking', 'wildlife'],
  waterfall: ['waterfall', 'stream', 'cascade', 'nature'],
  viewpoint: ['viewpoint', 'view', 'scenic', 'photography'],
  cable_car: ['cable car', 'gondola', 'viewpoint', 'island', 'scenic'],
  safari: ['safari', 'zoo', 'wildlife', 'family', 'animals'],
  theme_park: ['theme park', 'water park', 'rides', 'family', 'entertainment'],
  nightlife: [
    'night market',
    'rooftop',
    'entertainment district',
    'bar',
    'late night',
    'nightlife',
  ],
  shopping: ['mall', 'market', 'shopping street', 'artisan market', 'shopping', 'crafts'],
  photography: [
    'viewpoint',
    'landmark',
    'garden',
    'architecture',
    'street art',
    'scenic area',
    'photography',
    'photo',
  ],
  sports: [
    'sports venue',
    'active recreation',
    'stadium',
    'court',
    'sports experience',
    'sports centre',
    'sports center',
  ],
  beaches: ['beach', 'coast', 'island', 'waterfront', 'seaside'],
  hiking: ['trail', 'hill', 'nature reserve', 'forest', 'trekking', 'hiking'],
  fishing_village: ['fishing village', 'seafood', 'local culture', 'waterfront'],
  local_experience: ['local experience', 'fishing village', 'market', 'street food', 'local'],
  wellness_spa: ['spa', 'wellness', 'massage', 'hot spring', 'retreat'],
  local: ['local', 'malaysian', 'mamak', 'hawker', 'kopitiam', 'street food', 'market'],
  halal: ['halal', 'mamak', 'malay', 'malaysian'],
  food: ['restaurant', 'cafe', 'food', 'dining', 'eat', 'hawker'],
  culture: ['culture', 'heritage', 'museum', 'temple', 'mosque', 'gallery'],
}

const PREFERENCE_ALIASES: Record<string, string> = {
  museum: 'museums',
  museums: 'museums',
  history: 'history',
  historic: 'history',
  temples: 'religious',
  temple: 'religious',
  religious: 'religious',
  'place of worship': 'religious',
  market: 'market',
  markets: 'market',
  'night market': 'market',
  night_market: 'night_market',
  nightmarket: 'night_market',
  aquarium: 'family',
  family: 'family',
  'family activities': 'family',
  safari: 'safari',
  zoo: 'safari',
  'theme park': 'theme_park',
  theme_park: 'theme_park',
  landmark: 'landmark',
  landmarks: 'landmark',
  'iconic landmark': 'landmark',
  'iconic landmarks': 'landmark',
  'iconic attraction': 'landmark',
  'iconic attractions': 'landmark',
  entertainment: 'entertainment',
  nature: 'nature',
  viewpoint: 'viewpoint',
  viewpoints: 'viewpoint',
  sightseeing: 'sightseeing',
  nightlife: 'nightlife',
  shopping: 'shopping',
  photography: 'photography',
  photo: 'photography',
  sports: 'sports',
  sport: 'sports',
  beaches: 'beaches',
  beach: 'beaches',
  island: 'island',
  islands: 'island',
  'national park': 'national_park',
  national_park: 'national_park',
  waterfall: 'waterfall',
  waterfalls: 'waterfall',
  'cable car': 'cable_car',
  cable_car: 'cable_car',
  'fishing village': 'fishing_village',
  fishing_village: 'fishing_village',
  'local experience': 'local_experience',
  local_experience: 'local_experience',
  hiking: 'hiking',
  wellness: 'wellness_spa',
  spa: 'wellness_spa',
  'wellness spa': 'wellness_spa',
  'wellness and spa': 'wellness_spa',
  local: 'local',
  halal: 'halal',
  food: 'food',
  dining: 'food',
  culture: 'culture',
  cultural: 'culture',
  'local culture': 'culture',
}

const GENERIC_ACTIVITY_NAMES = new Set(['badminton', 'swimming', 'shopping', 'walking', 'dining'])
const NON_PLACE_NAMES = new Set(['info center', 'information', 'tourist information'])
const CHAIN_BRAND_TERMS = [
  'mcdonald',
  'kfc',
  'burger king',
  'starbucks',
  'subway',
  'pizza hut',
  'domino',
  'nando',
  'secret recipe',
]
const OTHER_LOCALITY_TERMS = ['muar', 'penang', 'melaka', 'malacca', 'johor', 'ipoh', 'langkawi']
const FAST_FOOD_PREFERENCES = new Set(['fast food', 'familiar food', 'burger'])
const SPORTS_INTENTS = new Set(['sports', 'hiking'])

const TRAVEL_STYLE_KEYWORDS: Record<string, string[]> = {
  adventure: ['adventure', 'outdoor', 'sports', 'hiking', 'badminton', 'active'],
  backpacking: ['budget', 'hostel', 'market', 'street', 'public', 'local'],
  budget: ['free', 'budget', 'market', 'street', 'park', 'garden', 'mosque'],
  cultural: ['culture', 'heritage', 'history', 'museum', 'mosque', 'sculpture', 'garden'],
  family: ['family', 'kids', 'children', 'park', 'garden', 'zoo'],
  luxury: ['luxury', 'premium', 'fine', 'boutique', 'hotel', 'resort'],
  relaxation: ['relax', 'wellness', 'spa', 'garden', 'park', 'scenic'],
  romantic: ['romantic', 'couple', 'scenic', 'photography', 'garden'],
}

export interface DestinationCityResolution {
  id: string
  name: string
  slug: string
  countryName: string
  countrySlug: string
  currencyCode?: string | null
}

interface CityContext {
  id: string
  name: string
  slug: string
  latitude?: unknown
  longitude?: unknown
  country: {
    name: string
    slug: string
    currencyCode?: string | null
  }
}

interface TagRow {
  name: string
  slug: string
}

interface OpeningHourRow {
  dayOfWeek: number
  opensAt?: string | null
  closesAt?: string | null
  isClosed: boolean
  note?: string | null
}

interface EnrichmentRow {
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

interface BaseEntityRow {
  id: string
  cityId: string
  name: string
  slug: string
  description?: string | null
  address?: string | null
  latitude?: unknown
  longitude?: unknown
  websiteUrl?: string | null
  phone?: string | null
  priceLevel?: number | null
  durationMinutes?: number | null
  updatedAt: Date
  city: CityContext
  tags: TagRow[]
  openingHours: OpeningHourRow[]
  enrichment?: EnrichmentRow | null
}

interface RestaurantRow extends BaseEntityRow {
  cuisines: string[]
}

interface HotelRow extends BaseEntityRow {
  amenities: string[]
}

interface ActivityRow extends BaseEntityRow {
  category?: string | null
}

interface DestinationNameMetadata {
  verifiedEnglishName?: string | null
  osmEnglishName?: string | null
  localName?: string | null
  sourceCategories?: string[]
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inferDestinationSource(websiteUrl?: string | null): DestinationImportSource {
  if (websiteUrl?.includes('wikivoyage.org')) return DestinationImportSource.WIKIVOYAGE
  if (websiteUrl?.includes('wikipedia.org')) return DestinationImportSource.WIKIPEDIA
  return DestinationImportSource.OPENSTREETMAP
}

function buildCandidateId(entityType: DestinationEntityType, id: string): string {
  return `${entityType}:${id}`
}

function entityTable(entityType: DestinationEntityType): DestinationCandidate['entityTable'] {
  if (entityType === 'ATTRACTION') return 'attractions'
  if (entityType === 'RESTAURANT') return 'restaurants'
  if (entityType === 'HOTEL') return 'hotels'
  return 'activities'
}

function factEntityType(entityType: DestinationEntityType): DestinationFactEntityType {
  return DestinationFactEntityType[entityType]
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

function readCityCenter(city: CityContext): GeoPoint | undefined {
  const latitude = toNumber(city.latitude)
  const longitude = toNumber(city.longitude)
  if (latitude != null && longitude != null) {
    const point = { latitude, longitude }
    if (isValidGeoPoint(point)) return point
  }

  return KNOWN_CITY_CENTERS[`${city.country.slug}:${city.slug}`]
}

function isLegacyGuideCandidate(candidate: DestinationCandidate): boolean {
  if (candidate.source !== DestinationImportSource.WIKIVOYAGE) return false

  const articleSlug = readWikivoyageArticleSlug(candidate.sourceUrl ?? candidate.websiteUrl ?? '')
  if (articleSlug === candidate.slug) return true
  if (candidate.slug === candidate.citySlug || candidate.slug === candidate.countrySlug) return true

  const description = ` ${(candidate.description ?? '').toLowerCase()} `
  return [
    ' is a country ',
    ' is a state ',
    ' is a city ',
    ' is a town ',
    ' is a satellite city ',
    ' is a district ',
  ].some((term) => description.includes(term))
}

function priceConfidence(priceLevel?: number | null): DestinationPriceConfidence {
  return priceLevel == null ? 'PRICE_UNKNOWN' : 'ESTIMATED_PRICE'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseExternalIds(value: unknown): {
  englishName?: string | null
  englishNameSource?: string | null
} {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    englishName: typeof record.englishName === 'string' ? record.englishName : null,
    englishNameSource:
      typeof record.englishNameSource === 'string' ? record.englishNameSource : null,
  }
}

function nameMetadataFromExternalIds(
  externalIds: unknown
): Pick<DestinationNameMetadata, 'verifiedEnglishName' | 'osmEnglishName'> {
  const parsed = parseExternalIds(externalIds)
  if (!parsed.englishName) return {}
  if (parsed.englishNameSource === 'osm:name:en') return { osmEnglishName: parsed.englishName }
  return { verifiedEnglishName: parsed.englishName }
}

function retrievalCategoriesFromTagRows(tags: TagRow[]): {
  categories: string[]
  sourceCategories: string[]
} {
  const sourceCategories = [...new Set(tags.map((tag) => tag.slug).filter(Boolean))]
  return {
    categories: retrievalCategoriesForDestination({ sourceCategories, tags: sourceCategories }),
    sourceCategories,
  }
}

function openingHoursFromFact(fact: EffectiveDestinationFact): DestinationOpeningHourContext[] {
  const value = fact.value
  if (!isRecord(value) || !Array.isArray(value.weekly)) return []

  return value.weekly.flatMap((dayValue) => {
    if (!isRecord(dayValue)) return []
    const day = readString(dayValue.day)
    const dayOfWeek = day ? WEEKDAY_TO_INDEX[day] : undefined
    if (dayOfWeek == null) return []
    const closed = dayValue.closed === true
    const intervals = Array.isArray(dayValue.intervals) ? dayValue.intervals : []

    if (closed || intervals.length === 0) {
      return [{ dayOfWeek, isClosed: closed, note: readString(value.notes) }]
    }

    return intervals.flatMap((interval) => {
      if (!isRecord(interval)) return []
      const opensAt = readString(interval.opens)
      const closesAt = readString(interval.closes)
      if (!opensAt || !closesAt) return []
      return [{ dayOfWeek, opensAt, closesAt, isClosed: false, note: readString(value.notes) }]
    })
  })
}

function pricesFromFact(fact: EffectiveDestinationFact): DestinationTicketPriceContext[] {
  const values = Array.isArray(fact.value) ? fact.value : [fact.value]

  return values.flatMap((value) => {
    if (!isRecord(value)) return []
    const currency = readString(value.currency)
    const priceType = readString(value.priceType)
    if (
      !currency ||
      !priceType ||
      !['FIXED', 'FROM', 'RANGE', 'FREE', 'UNKNOWN'].includes(priceType)
    ) {
      return []
    }

    const audience = readString(value.audience)
    return [
      {
        amount: readNumber(value.amount),
        minAmount: readNumber(value.minAmount),
        maxAmount: readNumber(value.maxAmount),
        currency,
        priceType: priceType as DestinationTicketPriceContext['priceType'],
        audience:
          audience && ['ADULT', 'CHILD', 'SENIOR', 'STUDENT', 'GENERAL'].includes(audience)
            ? (audience as DestinationTicketPriceContext['audience'])
            : undefined,
        notes: readString(value.notes),
      },
    ]
  })
}

function priceConfidenceFromPrices(
  prices: DestinationTicketPriceContext[]
): DestinationPriceConfidence {
  if (prices.length === 0) return 'PRICE_UNKNOWN'
  const generalPrice =
    prices.find((price) => price.audience === 'GENERAL') ??
    (prices.length === 1 ? prices[0] : undefined)
  if (!generalPrice) return 'PRICE_UNKNOWN'
  if (generalPrice.priceType === 'FREE' || generalPrice.priceType === 'FIXED') return 'KNOWN_PRICE'
  if (generalPrice.priceType === 'FROM' || generalPrice.priceType === 'RANGE')
    return 'ESTIMATED_PRICE'
  return 'PRICE_UNKNOWN'
}

function sourceSummary(
  factType: DestinationFactType,
  fact: EffectiveDestinationFact
): DestinationFactSourceContext {
  return {
    factType,
    sourceKey: fact.fact.sourceKey,
    sourceTier: fact.fact.sourceTier,
    status: fact.status,
    retrievedAt: fact.fact.retrievedAt.toISOString(),
    verifiedAt: fact.fact.verifiedAt?.toISOString(),
    stale: fact.stale,
    confidence: fact.fact.confidence,
  }
}

function currentFactualStatus(statuses: CandidateFactualStatus[]): CandidateFactualStatus {
  if (statuses.includes('STALE')) return 'STALE'
  if (statuses.includes('VERIFIED')) return 'VERIFIED'
  if (statuses.includes('PARTIAL')) return 'PARTIAL'
  return 'UNKNOWN'
}

function factualCompletenessScore(
  row: BaseEntityRow,
  tags: string[],
  categories: string[]
): number {
  let score = 30
  if (row.description) score += 15
  if (row.address) score += 15
  if (tags.length > 0 || categories.length > 0) score += 10
  if (row.openingHours.length > 0) score += 15
  if (row.priceLevel != null) score += 5
  if (row.durationMinutes || row.enrichment?.estimatedVisitDurationMinutes) score += 10
  return Math.min(score, 100)
}

function staleFactCount(row: BaseEntityRow, lastVerifiedAt: Date): number {
  const provenance = {
    retrievedAt: lastVerifiedAt.toISOString(),
    verifiedAt: lastVerifiedAt.toISOString(),
  }
  const checks = [
    evaluateFactStaleness('ADDRESS', provenance),
    evaluateFactStaleness('COORDINATES', provenance),
    evaluateFactStaleness('DESCRIPTION_TAGS', provenance),
  ]
  if (row.openingHours.length > 0) checks.push(evaluateFactStaleness('OPENING_HOURS', provenance))
  if (row.priceLevel != null) checks.push(evaluateFactStaleness('TICKET_PRICE', provenance))
  return checks.filter((check) => check.stale).length
}

function enrichmentState(candidate: {
  enrichment?: EnrichmentRow | null
  description?: string | null
  tags: string[]
  categories: string[]
  openingHours: DestinationOpeningHourContext[]
  durationMinutes?: number | null
  priceLevel?: number | null
}): CandidateEnrichmentState {
  if (candidate.enrichment) return 'ENRICHED'
  if (
    candidate.description ||
    candidate.tags.length > 0 ||
    candidate.categories.length > 0 ||
    candidate.openingHours.length > 0 ||
    candidate.durationMinutes ||
    candidate.priceLevel != null
  ) {
    return 'PARTIALLY_ENRICHED'
  }
  return 'SOURCE_ONLY'
}

function mapBaseCandidate(
  row: BaseEntityRow,
  entityType: DestinationEntityType,
  categories: string[],
  metadata: DestinationNameMetadata = {}
): DestinationCandidate | null {
  const latitude = toNumber(row.latitude)
  const longitude = toNumber(row.longitude)
  if (latitude == null || longitude == null) return null

  const point = { latitude, longitude }
  if (!isValidGeoPoint(point)) return null

  const cityCenter = readCityCenter(row.city)
  const distanceFromCityCenterKm = cityCenter
    ? Number(haversineDistanceKm(point, cityCenter).toFixed(2))
    : undefined
  const tags = row.tags.map((tag) => tag.slug)
  const displayName = selectDestinationDisplayName({
    primaryName: row.name,
    localName: metadata.localName ?? row.name,
    verifiedEnglishName: metadata.verifiedEnglishName,
    osmEnglishName: metadata.osmEnglishName,
  })
  const source = inferDestinationSource(row.websiteUrl)
  const enrichment = row.enrichment ?? null
  const lastVerifiedAt = enrichment?.generatedAt ?? row.updatedAt
  const candidate = {
    candidateId: buildCandidateId(entityType, row.id),
    id: row.id,
    entityType,
    entityTable: entityTable(entityType),
    cityId: row.cityId,
    cityName: row.city.name,
    citySlug: row.city.slug,
    countryName: row.city.country.name,
    countrySlug: row.city.country.slug,
    primaryName: displayName.primaryName,
    localName: displayName.localName,
    englishName: displayName.englishName,
    displayName: displayName.displayName,
    displayNameSource: displayName.displayNameSource,
    name: displayName.displayName,
    slug: row.slug,
    description: row.description,
    address: row.address,
    latitude,
    longitude,
    websiteUrl: row.websiteUrl,
    source,
    sourceUrl: row.websiteUrl,
    categories,
    sourceCategories: metadata.sourceCategories ?? categories,
    tags,
    openingHours: row.openingHours,
    openingHoursStatus: row.openingHours.length > 0 ? 'PARTIAL' : 'UNKNOWN',
    priceLevel: row.priceLevel,
    ticketPrices: [],
    ticketPriceStatus: row.priceLevel != null ? 'PARTIAL' : 'UNKNOWN',
    priceConfidence: priceConfidence(row.priceLevel),
    currency: row.city.country.currencyCode,
    officialUrl: row.websiteUrl,
    officialUrlStatus: row.websiteUrl ? 'PARTIAL' : 'UNKNOWN',
    durationMinutes: row.durationMinutes,
    lastVerifiedAt,
    openingHoursKnown: row.openingHours.length > 0,
    factualCompletenessScore: factualCompletenessScore(row, tags, categories),
    staleFactCount: staleFactCount(row, lastVerifiedAt),
    factualStatus: currentFactualStatus([
      row.openingHours.length > 0 ? 'PARTIAL' : 'UNKNOWN',
      row.priceLevel != null ? 'PARTIAL' : 'UNKNOWN',
      row.websiteUrl ? 'PARTIAL' : 'UNKNOWN',
    ]),
    factSourceSummary: [],
    enrichmentState: enrichmentState({
      enrichment,
      description: row.description,
      tags,
      categories,
      openingHours: row.openingHours,
      durationMinutes: row.durationMinutes,
      priceLevel: row.priceLevel,
    }),
    enrichment,
    distanceFromCityCenterKm,
  } satisfies DestinationCandidate

  return candidate
}

function recalculateFactualCompletenessScore(candidate: DestinationCandidate): number {
  let score = 25
  if (candidate.description) score += 15
  if (candidate.address) score += 15
  if (candidate.tags.length > 0 || candidate.categories.length > 0) score += 10
  if (candidate.openingHoursStatus === 'VERIFIED') score += 15
  else if (candidate.openingHoursStatus === 'PARTIAL' || candidate.openingHoursStatus === 'STALE')
    score += 8
  if (candidate.ticketPriceStatus === 'VERIFIED') score += 10
  else if (candidate.ticketPriceStatus === 'PARTIAL' || candidate.ticketPriceStatus === 'STALE')
    score += 4
  if (candidate.durationMinutes || candidate.enrichment?.estimatedVisitDurationMinutes) score += 8
  if (candidate.officialUrl) score += 4
  return Math.min(score, 100)
}

function latestFactTimestamp(
  fallback: Date | undefined,
  summaries: DestinationFactSourceContext[]
): Date | undefined {
  const timestamps = summaries.flatMap((summary) => [
    summary.verifiedAt ? Date.parse(summary.verifiedAt) : 0,
    Date.parse(summary.retrievedAt),
  ])
  const latest = Math.max(0, ...timestamps)
  return latest > 0 ? new Date(latest) : fallback
}

function stringValueFromFact(fact: EffectiveDestinationFact): string | undefined {
  if (typeof fact.value === 'string') return fact.value
  if (isRecord(fact.value)) return readString(fact.value.url) ?? readString(fact.value.value)
  return undefined
}

function durationFromFact(fact: EffectiveDestinationFact): number | undefined {
  if (typeof fact.value === 'number' && Number.isInteger(fact.value)) return fact.value
  if (isRecord(fact.value)) {
    const minutes = readNumber(fact.value.minutes) ?? readNumber(fact.value.durationMinutes)
    return minutes && Number.isInteger(minutes) ? minutes : undefined
  }
  return undefined
}

function coordinatesFromFact(
  fact: EffectiveDestinationFact
): Pick<DestinationCandidate, 'latitude' | 'longitude'> | undefined {
  if (!isRecord(fact.value)) return undefined
  const latitude = readNumber(fact.value.latitude)
  const longitude = readNumber(fact.value.longitude)
  if (latitude == null || longitude == null || !isValidGeoPoint({ latitude, longitude }))
    return undefined
  return { latitude, longitude }
}

function enhanceCandidateWithFacts(
  candidate: DestinationCandidate,
  effectiveFacts: Map<string, EffectiveDestinationFact>
): DestinationCandidate {
  const ref = {
    entityType: factEntityType(candidate.entityType),
    entityId: candidate.id,
  }
  const summaries: DestinationFactSourceContext[] = []
  const next: DestinationCandidate = { ...candidate, factSourceSummary: summaries }

  const openingHoursFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.OPENING_HOURS)
  )
  if (openingHoursFact) {
    const openingHours = openingHoursFromFact(openingHoursFact)
    next.openingHours = openingHours
    next.openingHoursKnown = openingHours.length > 0
    next.openingHoursStatus = openingHoursFact.status
    summaries.push(sourceSummary(DestinationFactType.OPENING_HOURS, openingHoursFact))
  }

  const ticketPriceFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.TICKET_PRICE)
  )
  if (ticketPriceFact) {
    const prices = pricesFromFact(ticketPriceFact)
    next.ticketPrices = prices
    next.ticketPriceStatus = ticketPriceFact.status
    next.priceConfidence = priceConfidenceFromPrices(prices)
    next.currency = prices.find((price) => price.currency)?.currency ?? next.currency
    summaries.push(sourceSummary(DestinationFactType.TICKET_PRICE, ticketPriceFact))
  }

  const addressFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.ADDRESS))
  if (addressFact) {
    next.address = stringValueFromFact(addressFact) ?? next.address
    summaries.push(sourceSummary(DestinationFactType.ADDRESS, addressFact))
  }

  const coordinatesFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.COORDINATES)
  )
  if (coordinatesFact) {
    Object.assign(next, coordinatesFromFact(coordinatesFact))
    summaries.push(sourceSummary(DestinationFactType.COORDINATES, coordinatesFact))
  }

  const officialUrlFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.OFFICIAL_URL)
  )
  if (officialUrlFact) {
    next.officialUrl = stringValueFromFact(officialUrlFact) ?? next.officialUrl
    next.officialUrlStatus = officialUrlFact.status
    summaries.push(sourceSummary(DestinationFactType.OFFICIAL_URL, officialUrlFact))
  }

  const operationalStatusFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.OPERATIONAL_STATUS)
  )
  if (operationalStatusFact) {
    summaries.push(sourceSummary(DestinationFactType.OPERATIONAL_STATUS, operationalStatusFact))
  }

  const visitDurationFact = effectiveFacts.get(
    destinationFactKey(ref, DestinationFactType.VISIT_DURATION)
  )
  if (visitDurationFact) {
    next.durationMinutes = durationFromFact(visitDurationFact) ?? next.durationMinutes
    summaries.push(sourceSummary(DestinationFactType.VISIT_DURATION, visitDurationFact))
  }

  next.lastVerifiedAt = latestFactTimestamp(candidate.lastVerifiedAt, summaries)
  next.staleFactCount = summaries.filter(
    (summary) => summary.stale || summary.status === 'STALE'
  ).length
  next.factualStatus = currentFactualStatus([
    next.openingHoursStatus,
    next.ticketPriceStatus,
    next.officialUrlStatus,
    ...summaries.map((summary) => summary.status),
  ])
  next.factualCompletenessScore = recalculateFactualCompletenessScore(next)

  return next
}

function searchableText(candidate: DestinationCandidate): string {
  return [
    candidate.name,
    candidate.description,
    candidate.address,
    candidate.tags.join(' '),
    candidate.categories.join(' '),
    candidate.enrichment?.shortSummary,
    candidate.enrichment?.bestFor.join(' '),
    candidate.enrichment?.searchTags.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function normalizeIntentTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalPreference(value: string): string | undefined {
  const normalized = normalizeIntentTerm(value)
  return (
    PREFERENCE_ALIASES[normalized] ?? (PREFERENCE_INTENT_TERMS[normalized] ? normalized : undefined)
  )
}

function selectedPreferenceKeys(query: DestinationRetrievalQuery): string[] {
  return [
    ...new Set(
      [...(query.interests ?? []), ...(query.travelStyles ?? [])]
        .map(canonicalPreference)
        .filter((preference): preference is string => Boolean(preference))
    ),
  ]
}

function structuredPreferenceText(candidate: DestinationCandidate): string {
  const wikivoyageSectionTerms = candidate.tags.flatMap((tag) => {
    if (tag === 'wikivoyage-see') return ['see', 'sightseeing', 'landmark']
    if (tag === 'wikivoyage-do') return ['do', 'activity']
    if (tag === 'wikivoyage-eat') return ['eat', 'food', 'restaurant']
    if (tag === 'wikivoyage-sleep') return ['sleep', 'hotel']
    return []
  })

  return [
    candidate.entityType.toLowerCase(),
    ...candidate.categories,
    ...candidate.tags,
    ...wikivoyageSectionTerms,
    ...(candidate.enrichment?.bestFor ?? []),
    ...(candidate.enrichment?.searchTags ?? []),
  ]
    .map(normalizeIntentTerm)
    .filter(Boolean)
    .join(' ')
}

function fallbackPreferenceText(candidate: DestinationCandidate): string {
  return normalizeIntentTerm(searchableText(candidate))
}

function evaluatePreferenceMatch(
  candidate: DestinationCandidate,
  query: DestinationRetrievalQuery
): DestinationPreferenceMatch {
  const selectedPreferences = selectedPreferenceKeys(query)
  const structuredText = structuredPreferenceText(candidate)
  const fallbackText = fallbackPreferenceText(candidate)
  const strongMatches: string[] = []
  const partialMatches: string[] = []
  const unmatchedPreferences: string[] = []

  for (const preference of selectedPreferences) {
    const terms = PREFERENCE_INTENT_TERMS[preference] ?? [preference]
    const structuredMatch = terms.some((term) => structuredText.includes(normalizeIntentTerm(term)))
    const fallbackMatch = terms.some((term) => fallbackText.includes(normalizeIntentTerm(term)))

    if (structuredMatch) strongMatches.push(preference)
    else if (fallbackMatch) partialMatches.push(preference)
    else unmatchedPreferences.push(preference)
  }

  const score =
    selectedPreferences.length === 0
      ? 6
      : Math.min(30, strongMatches.length * 12 + partialMatches.length * 6)
  const reasons: string[] = []
  if (strongMatches.length > 0)
    reasons.push(`strong interest preference match: ${strongMatches.join(', ')}`)
  if (partialMatches.length > 0)
    reasons.push(`partial interest preference match: ${partialMatches.join(', ')}`)
  if (selectedPreferences.length > 0 && strongMatches.length === 0 && partialMatches.length === 0) {
    reasons.push('no selected preference match')
  }

  return {
    selectedPreferences,
    strongMatches,
    partialMatches,
    unmatchedPreferences,
    score,
    reasons,
  }
}

function selectedPreferenceSet(query: DestinationRetrievalQuery): Set<string> {
  return new Set(selectedPreferenceKeys(query))
}

function hasFastFoodPreference(query: DestinationRetrievalQuery): boolean {
  return [...(query.interests ?? []), ...(query.travelStyles ?? [])].some((preference) =>
    FAST_FOOD_PREFERENCES.has(normalizeIntentTerm(preference))
  )
}

function isGenericActivity(candidate: DestinationCandidate): boolean {
  return (
    candidate.entityType === 'ACTIVITY' &&
    GENERIC_ACTIVITY_NAMES.has(normalizeIntentTerm(candidate.name))
  )
}

function isNonPlaceEntity(candidate: DestinationCandidate): boolean {
  const normalizedName = normalizeIntentTerm(candidate.name)
  const terms = structuredPreferenceText(candidate)
  return NON_PLACE_NAMES.has(normalizedName) || terms.includes(' information ')
}

function isChainBrand(candidate: DestinationCandidate): boolean {
  if (candidate.entityType !== 'RESTAURANT') return false
  const normalizedName = normalizeIntentTerm(candidate.name)
  return CHAIN_BRAND_TERMS.some((brand) => normalizedName.includes(brand))
}

function hasLocalityNameMismatch(candidate: DestinationCandidate): boolean {
  const normalizedName = normalizeIntentTerm(candidate.name)
  const currentCity = normalizeIntentTerm(candidate.cityName)
  const currentCountry = normalizeIntentTerm(candidate.countryName)
  return OTHER_LOCALITY_TERMS.some((locality) => {
    const normalizedLocality = normalizeIntentTerm(locality)
    if (normalizedLocality === currentCity || normalizedLocality === currentCountry) return false
    return normalizedName.includes(normalizedLocality)
  })
}

function hasBranchEvidence(candidate: DestinationCandidate): boolean {
  const address = normalizeIntentTerm(candidate.address ?? '')
  return (
    Boolean(candidate.sourceUrl || candidate.officialUrl) &&
    address.includes(normalizeIntentTerm(candidate.cityName))
  )
}

function isSportsCandidate(candidate: DestinationCandidate): boolean {
  const terms = `${structuredPreferenceText(candidate)} ${normalizeIntentTerm(candidate.name)} ${fallbackPreferenceText(candidate)}`
  return [
    'sports',
    'sport',
    'sports centre',
    'sports center',
    'court',
    'stadium',
    'badminton',
    'cycle',
    'bike lane',
    'hike',
    'hiking',
    'trail',
  ].some((term) => terms.includes(normalizeIntentTerm(term)))
}

function hasSportsIntent(query: DestinationRetrievalQuery): boolean {
  const preferences = selectedPreferenceSet(query)
  const rawIntents = [...(query.interests ?? []), ...(query.travelStyles ?? [])].map(
    normalizeIntentTerm
  )
  return (
    [...SPORTS_INTENTS].some((intent) => preferences.has(intent)) ||
    rawIntents.includes('adventure')
  )
}

function hostFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function baseName(value: string): string {
  return normalizeIntentTerm(value)
    .replace(/\b(kuala lumpur|kl|hotel|restaurant|cafe|café)\b/g, '')
    .trim()
}

function classifyDuplicateCandidate(
  candidate: DestinationCandidate,
  previous: RankedDestinationCandidate[]
): { status: DestinationDuplicateStatus; penalty: number; reason?: string } {
  const duplicate = previous.find((other) => {
    if (other.entityType !== candidate.entityType) return false
    const distance = haversineDistanceKm(
      { latitude: other.latitude, longitude: other.longitude },
      { latitude: candidate.latitude, longitude: candidate.longitude }
    )
    return other.slug === candidate.slug || distance < 0.08
  })

  if (!duplicate) {
    const sameBrand = previous.find((other) => {
      if (other.entityType !== candidate.entityType) return false
      if (!baseName(other.name) || baseName(other.name) !== baseName(candidate.name)) return false
      const distance = haversineDistanceKm(
        { latitude: other.latitude, longitude: other.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude }
      )
      return distance >= 0.08
    })
    return sameBrand
      ? {
          status: 'SAME_BRAND_DIFFERENT_BRANCH',
          penalty: 4,
          reason: `same brand as ${sameBrand.name}`,
        }
      : { status: 'DISTINCT', penalty: 0 }
  }

  const candidateDomain = hostFromUrl(candidate.officialUrl ?? candidate.sourceUrl)
  const duplicateDomain = hostFromUrl(duplicate.officialUrl ?? duplicate.sourceUrl)
  const status: DestinationDuplicateStatus =
    candidate.slug === duplicate.slug
      ? 'EXACT_DUPLICATE'
      : candidateDomain && duplicateDomain && candidateDomain === duplicateDomain
        ? 'SAME_PLACE_DIFFERENT_SOURCE'
        : 'POSSIBLE_DUPLICATE'
  const penalty = status === 'POSSIBLE_DUPLICATE' ? 20 : 28

  return { status, penalty, reason: `${status.toLowerCase()} of ${duplicate.name}` }
}

function readinessDecision(score: number, penalties: string[]): ItineraryReadiness['decision'] {
  if (penalties.includes('GENERIC_ACTIVITY') || penalties.includes('NON_PLACE_ENTITY'))
    return 'INELIGIBLE'
  if (penalties.includes('LOCALITY_NAME_MISMATCH') && penalties.includes('MISSING_SOURCE_URL'))
    return 'REVIEW'
  if (penalties.includes('CHAIN_BRAND_LOW_PRIORITY') && score >= 60) return 'BACKUP'
  if (penalties.includes('CLEAR_PREFERENCE_MISMATCH') && score >= 60) return 'BACKUP'
  if (penalties.includes('WEAK_PREFERENCE_MATCH') && score >= 60) return 'BACKUP'
  if (score >= 80) return 'ELIGIBLE'
  if (score >= 60) return 'BACKUP'
  if (score >= 40) return 'REVIEW'
  return 'INELIGIBLE'
}

function evaluateItineraryReadiness(input: {
  candidate: DestinationCandidate
  query: DestinationRetrievalQuery
  preference: DestinationPreferenceMatch
  duplicate: { status: DestinationDuplicateStatus; penalty: number; reason?: string }
}): { readiness: ItineraryReadiness; penalties: string[] } {
  const { candidate, query, preference, duplicate } = input
  const penalties: string[] = []
  let score =
    20 +
    sourceScore(candidate) +
    completenessScore(candidate) +
    geographicScore(candidate) +
    enrichmentScore(candidate)

  if (candidate.cityId === query.cityId) score += 15
  if (isValidGeoPoint(candidate)) score += 15
  if (candidate.sourceUrl || candidate.websiteUrl) score += 8
  else {
    score -= 8
    penalties.push('MISSING_SOURCE_URL')
  }
  if (candidate.openingHoursStatus === 'VERIFIED') score += 4
  else if (candidate.openingHoursStatus === 'PARTIAL') score += 2
  if (candidate.ticketPriceStatus === 'VERIFIED') score += 3
  else if (candidate.ticketPriceStatus === 'PARTIAL') score += 1

  score += preference.score
  if (
    preference.selectedPreferences.length > 0 &&
    preference.strongMatches.length === 0 &&
    preference.partialMatches.length === 0
  ) {
    score -= 18
    penalties.push('WEAK_PREFERENCE_MATCH')
  }

  if (isGenericActivity(candidate)) {
    score -= 50
    penalties.push('GENERIC_ACTIVITY')
  }
  if (isNonPlaceEntity(candidate)) {
    score -= 35
    penalties.push('NON_PLACE_ENTITY')
  }
  if (isChainBrand(candidate) && !hasFastFoodPreference(query)) {
    score -= 25
    penalties.push('CHAIN_BRAND_LOW_PRIORITY')
  }
  if (hasLocalityNameMismatch(candidate)) {
    score -= hasBranchEvidence(candidate) ? 8 : 25
    penalties.push('LOCALITY_NAME_MISMATCH')
  }
  if (isSportsCandidate(candidate) && !hasSportsIntent(query)) {
    score -= 28
    penalties.push('CLEAR_PREFERENCE_MISMATCH')
  }
  if (candidate.factualCompletenessScore < 45) {
    score -= 8
    penalties.push('LOW_INFORMATION_ENTITY')
  }
  if (duplicate.status !== 'DISTINCT') {
    score -= duplicate.penalty
    penalties.push(duplicate.status)
  }
  if (candidate.staleFactCount > 0) score -= Math.min(candidate.staleFactCount * 2, 6)

  const boundedScore = Math.max(0, Math.min(100, Number(score.toFixed(1))))
  const reasons = [
    ...preference.reasons,
    ...(candidate.sourceUrl || candidate.websiteUrl ? ['has source URL'] : []),
    ...(candidate.openingHoursStatus === 'VERIFIED' ? ['verified opening hours'] : []),
    ...(candidate.ticketPriceStatus === 'VERIFIED' ? ['verified price'] : []),
    ...penalties,
  ]

  return {
    readiness: {
      score: boundedScore,
      decision: readinessDecision(boundedScore, penalties),
      reasons: [...new Set(reasons)],
    },
    penalties: [...new Set(penalties)],
  }
}

function sourceScore(candidate: DestinationCandidate): number {
  if (candidate.source === DestinationImportSource.GOVERNMENT_TOURISM) return 10
  if (candidate.source === DestinationImportSource.OPENSTREETMAP) return 8
  if (candidate.source === DestinationImportSource.WIKIVOYAGE) return 8
  return 4
}

function completenessScore(candidate: DestinationCandidate): number {
  return Math.min(15, Math.round(candidate.factualCompletenessScore * 0.15))
}

function geographicScore(candidate: DestinationCandidate): number {
  const distance = candidate.distanceFromCityCenterKm
  if (distance == null) return 8
  if (distance <= 5) return 15
  if (distance <= 12) return 12
  if (distance <= 25) return 8
  if (distance <= 45) return 4
  return 0
}

function enrichmentScore(candidate: DestinationCandidate): number {
  if (candidate.enrichmentState === 'ENRICHED') return 8
  if (candidate.enrichmentState === 'PARTIALLY_ENRICHED') return 4
  return 1
}

function travelStyleScore(
  candidate: DestinationCandidate,
  travelStyles: string[]
): { score: number; matches: string[] } {
  const text = searchableText(candidate)
  const matches = travelStyles.filter((style) => {
    const keywords = TRAVEL_STYLE_KEYWORDS[style] ?? [style]
    return keywords.some((keyword) => text.includes(keyword.replace(/_/g, ' ')))
  })
  return { score: Math.min(matches.length * 5, 10), matches }
}

function budgetScore(candidate: DestinationCandidate, budgetLevel?: string): number {
  if (!budgetLevel) return 3
  const normalized = budgetLevel.toLowerCase()
  const enrichmentBudget = candidate.enrichment?.budgetLevel.toLowerCase()

  if (enrichmentBudget === normalized) return 5
  if (normalized === 'budget' && (candidate.priceLevel == null || candidate.priceLevel <= 2))
    return 5
  if (normalized === 'luxury' && candidate.priceLevel != null && candidate.priceLevel >= 4) return 5
  if (
    normalized === 'moderate' &&
    candidate.priceLevel != null &&
    candidate.priceLevel >= 2 &&
    candidate.priceLevel <= 3
  ) {
    return 5
  }
  return 1
}

export function rankDestinationCandidates(
  candidates: DestinationCandidate[],
  query: DestinationRetrievalQuery
): RankedDestinationCandidate[] {
  const ranked: RankedDestinationCandidate[] = []
  const sortedInput = [...candidates].sort((first, second) => first.name.localeCompare(second.name))

  for (const candidate of sortedInput) {
    const travelStyles = query.travelStyles ?? []
    const style = travelStyleScore(candidate, travelStyles)
    const preference = evaluatePreferenceMatch(candidate, query)
    const duplicate = classifyDuplicateCandidate(candidate, ranked)
    const readiness = evaluateItineraryReadiness({ candidate, query, preference, duplicate })
    const score = Math.max(
      0,
      Math.min(
        100,
        readiness.readiness.score +
          Math.min(style.score, 5) +
          budgetScore(candidate, query.budgetLevel) -
          Math.min(readiness.penalties.length, 8)
      )
    )
    const rankReasons = [
      `${candidate.source.toLowerCase()} source`,
      `${candidate.enrichmentState.toLowerCase()} data`,
      `${candidate.distanceFromCityCenterKm ?? 'unknown'} km from city center`,
      `readiness_${readiness.readiness.decision.toLowerCase()}_${readiness.readiness.score}`,
    ]

    for (const reason of preference.reasons) rankReasons.push(reason)
    if (style.matches.length > 0)
      rankReasons.push(`matches ${style.matches.join(', ')} travel style`)
    if (candidate.priceConfidence !== 'PRICE_UNKNOWN')
      rankReasons.push(candidate.priceConfidence.toLowerCase())
    if (candidate.openingHoursKnown)
      rankReasons.push(`opening_hours_${candidate.openingHoursStatus.toLowerCase()}`)
    if (candidate.ticketPriceStatus !== 'UNKNOWN')
      rankReasons.push(`ticket_price_${candidate.ticketPriceStatus.toLowerCase()}`)
    if (candidate.staleFactCount > 0)
      rankReasons.push(
        `${candidate.staleFactCount} stale fact marker${candidate.staleFactCount === 1 ? '' : 's'}`
      )
    if (duplicate.reason) rankReasons.push(duplicate.reason)
    for (const penalty of readiness.penalties) rankReasons.push(penalty)

    ranked.push({
      ...candidate,
      rankScore: Number(score.toFixed(1)),
      rankReasons: [...new Set(rankReasons)],
      preferenceMatch: preference,
      itineraryReadiness: readiness.readiness,
      duplicateStatus: duplicate.status,
      penaltiesApplied: readiness.penalties,
    })
  }

  return ranked.sort(
    (first, second) => second.rankScore - first.rankScore || first.name.localeCompare(second.name)
  )
}

function selectReadyCandidates(
  candidates: RankedDestinationCandidate[],
  query: DestinationRetrievalQuery
): RankedDestinationCandidate[] {
  const minimumEligible = Math.min(
    Math.max(DEFAULT_MIN_ELIGIBLE_CANDIDATES, query.limitPerType ?? DEFAULT_LIMIT_PER_TYPE),
    candidates.length
  )
  const eligible = candidates.filter(
    (candidate) => candidate.itineraryReadiness?.decision === 'ELIGIBLE'
  )
  const backup = candidates.filter(
    (candidate) => candidate.itineraryReadiness?.decision === 'BACKUP'
  )

  if (eligible.length >= minimumEligible) return eligible

  const selectedIds = new Set(eligible.map((candidate) => candidate.candidateId))
  const selected = [...eligible]
  for (const candidate of backup) {
    if (selected.length >= minimumEligible) break
    if (selectedIds.has(candidate.candidateId)) continue
    selected.push({
      ...candidate,
      diversityReasons: [
        ...(candidate.diversityReasons ?? []),
        'backup used because eligible coverage is insufficient',
      ],
      rankReasons: [
        ...candidate.rankReasons,
        'backup used because eligible coverage is insufficient',
      ],
    })
    selectedIds.add(candidate.candidateId)
  }

  return selected.sort(
    (first, second) => second.rankScore - first.rankScore || first.name.localeCompare(second.name)
  )
}

function hasCulturalFocus(query: DestinationRetrievalQuery): boolean {
  const preferences = selectedPreferenceSet(query)
  return ['culture', 'museums', 'history', 'religious'].some((preference) =>
    preferences.has(preference)
  )
}

function diversityCapRatio(query: DestinationRetrievalQuery): number {
  return hasCulturalFocus(query) ? 0.55 : 0.4
}

function candidateDiversityCategory(candidate: RankedDestinationCandidate): string {
  return primaryRetrievalCategory({ categories: candidate.categories, tags: candidate.tags })
}

function annotateDiversity(
  candidate: RankedDestinationCandidate,
  reason: string
): RankedDestinationCandidate {
  return {
    ...candidate,
    diversityReasons: [...new Set([...(candidate.diversityReasons ?? []), reason])],
    rankReasons: [...new Set([...candidate.rankReasons, reason])],
  }
}

export function applyCandidateDiversityControls(
  candidates: RankedDestinationCandidate[],
  query: DestinationRetrievalQuery
): RankedDestinationCandidate[] {
  if (candidates.length <= 2) return candidates

  const targetSize = Math.min(
    candidates.length,
    Math.max(DEFAULT_MIN_ELIGIBLE_CANDIDATES, query.limitPerType ?? DEFAULT_LIMIT_PER_TYPE)
  )
  const maxPerCategory = Math.max(1, Math.ceil(targetSize * diversityCapRatio(query)))
  const availableCategories = [...new Set(candidates.map(candidateDiversityCategory))]
  const minimumDistinctCategories = Math.min(3, availableCategories.length, targetSize)
  const selected: RankedDestinationCandidate[] = []
  const selectedIds = new Set<string>()
  const categoryCounts = new Map<string, number>()

  function add(candidate: RankedDestinationCandidate, reason: string): boolean {
    if (selectedIds.has(candidate.candidateId)) return false
    const category = candidateDiversityCategory(candidate)
    selected.push(annotateDiversity(candidate, reason))
    selectedIds.add(candidate.candidateId)
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    return true
  }

  add(candidates[0], 'iconic/high-confidence candidate retained before diversity fill')

  for (const category of availableCategories) {
    if (new Set(selected.map(candidateDiversityCategory)).size >= minimumDistinctCategories) break
    const candidate = candidates.find((item) => candidateDiversityCategory(item) === category)
    if (candidate) add(candidate, 'category diversity seed')
  }

  for (const candidate of candidates) {
    if (selected.length >= targetSize) break
    const category = candidateDiversityCategory(candidate)
    if ((categoryCounts.get(category) ?? 0) >= maxPerCategory) continue
    add(candidate, `category diversity cap ${category} <= ${maxPerCategory}/${targetSize}`)
  }

  for (const candidate of candidates) {
    if (selected.length >= targetSize) break
    add(candidate, 'diversity cap relaxed to preserve useful candidate minimum')
  }

  return selected.sort(
    (first, second) => second.rankScore - first.rankScore || first.name.localeCompare(second.name)
  )
}

export function filterEligibleDestinationCandidates(
  candidates: DestinationCandidate[],
  query: DestinationRetrievalQuery
): DestinationCandidate[] {
  const includeTypes = query.includeTypes ?? ['ATTRACTION', 'RESTAURANT', 'HOTEL', 'ACTIVITY']
  return candidates.filter((candidate) => {
    if (candidate.cityId !== query.cityId) return false
    if (!includeTypes.includes(candidate.entityType)) return false
    if (!isValidGeoPoint(candidate)) return false
    if (isLegacyGuideCandidate(candidate)) return false
    return true
  })
}

function capPerType(
  candidates: RankedDestinationCandidate[],
  limitPerType: number
): RankedDestinationCandidate[] {
  const counts = new Map<DestinationEntityType, number>()
  return candidates.filter((candidate) => {
    const current = counts.get(candidate.entityType) ?? 0
    if (current >= limitPerType) return false
    counts.set(candidate.entityType, current + 1)
    return true
  })
}

export async function resolveDestinationCity(
  destination: string,
  db: PrismaClient = prisma
): Promise<DestinationCityResolution | null> {
  const trimmedDestination = destination.trim()
  const citySegment = trimmedDestination.split(',')[0]?.trim() || trimmedDestination
  const normalized = slugify(trimmedDestination)
  const normalizedCitySegment = slugify(citySegment)
  const city = await db.city.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: normalized },
        { slug: normalizedCitySegment },
        { name: { equals: trimmedDestination, mode: 'insensitive' } },
        { name: { equals: citySegment, mode: 'insensitive' } },
        { name: { contains: citySegment, mode: 'insensitive' } },
      ],
      country: { deletedAt: null },
    },
    include: { country: true },
  })

  if (!city) return null

  return {
    id: city.id,
    name: city.name,
    slug: city.slug,
    countryName: city.country.name,
    countrySlug: city.country.slug,
    currencyCode: city.country.currencyCode,
  }
}

export class DestinationRetrievalService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly factService = new DestinationFactService(db)
  ) {}

  async retrieve(query: DestinationRetrievalQuery): Promise<DestinationRetrievalResult> {
    const includeTypes = query.includeTypes ?? ['ATTRACTION', 'RESTAURANT', 'HOTEL', 'ACTIVITY']
    const candidates: DestinationCandidate[] = []

    if (includeTypes.includes('ATTRACTION')) {
      const rows = await this.db.attraction.findMany({
        where: {
          cityId: query.cityId,
          deletedAt: null,
          city: { deletedAt: null, country: { deletedAt: null } },
        },
        include: {
          city: { include: { country: true } },
          tags: true,
          openingHours: { where: { deletedAt: null }, orderBy: { dayOfWeek: 'asc' } },
          enrichment: true,
        },
      })
      const provenanceDelegate = (
        this.db as unknown as {
          destinationSourceProvenance?: {
            findMany: (args: {
              where: { entityType: DestinationFactEntityType; entityId: { in: string[] } }
              select: { entityId: true; externalIds: true }
            }) => Promise<Array<{ entityId: string; externalIds: unknown }>>
          }
        }
      ).destinationSourceProvenance
      const provenanceRows = provenanceDelegate
        ? await provenanceDelegate.findMany({
            where: {
              entityType: DestinationFactEntityType.ATTRACTION,
              entityId: { in: rows.map((row) => row.id) },
            },
            select: { entityId: true, externalIds: true },
          })
        : []
      const provenanceByEntityId = new Map(
        provenanceRows.map((row) => [row.entityId, row.externalIds])
      )
      candidates.push(
        ...rows
          .map((row) => {
            const { categories, sourceCategories } = retrievalCategoriesFromTagRows(row.tags)
            return mapBaseCandidate(row, 'ATTRACTION', categories, {
              ...nameMetadataFromExternalIds(provenanceByEntityId.get(row.id)),
              localName: row.name,
              sourceCategories,
            })
          })
          .filter((candidate): candidate is DestinationCandidate => Boolean(candidate))
      )
    }

    if (includeTypes.includes('RESTAURANT')) {
      const rows = await this.db.restaurant.findMany({
        where: {
          cityId: query.cityId,
          deletedAt: null,
          city: { deletedAt: null, country: { deletedAt: null } },
        },
        include: {
          city: { include: { country: true } },
          tags: true,
          openingHours: { where: { deletedAt: null }, orderBy: { dayOfWeek: 'asc' } },
          enrichment: true,
        },
      })
      candidates.push(
        ...rows
          .map((row: RestaurantRow) => mapBaseCandidate(row, 'RESTAURANT', row.cuisines))
          .filter((candidate): candidate is DestinationCandidate => Boolean(candidate))
      )
    }

    if (includeTypes.includes('HOTEL')) {
      const rows = await this.db.hotel.findMany({
        where: {
          cityId: query.cityId,
          deletedAt: null,
          city: { deletedAt: null, country: { deletedAt: null } },
        },
        include: {
          city: { include: { country: true } },
          tags: true,
          openingHours: { where: { deletedAt: null }, orderBy: { dayOfWeek: 'asc' } },
          enrichment: true,
        },
      })
      candidates.push(
        ...rows
          .map((row: HotelRow) => mapBaseCandidate(row, 'HOTEL', row.amenities))
          .filter((candidate): candidate is DestinationCandidate => Boolean(candidate))
      )
    }

    if (includeTypes.includes('ACTIVITY')) {
      const rows = await this.db.activity.findMany({
        where: {
          cityId: query.cityId,
          deletedAt: null,
          city: { deletedAt: null, country: { deletedAt: null } },
        },
        include: {
          city: { include: { country: true } },
          tags: true,
          openingHours: { where: { deletedAt: null }, orderBy: { dayOfWeek: 'asc' } },
          enrichment: true,
        },
      })
      candidates.push(
        ...rows
          .map((row: ActivityRow) =>
            mapBaseCandidate(row, 'ACTIVITY', row.category ? [row.category] : [])
          )
          .filter((candidate): candidate is DestinationCandidate => Boolean(candidate))
      )
    }

    const eligible = filterEligibleDestinationCandidates(candidates, query)
    const effectiveFacts = await this.factService.resolveEffectiveFactsForEntities(
      eligible.map((candidate) => ({
        entityType: factEntityType(candidate.entityType),
        entityId: candidate.id,
      })),
      [
        DestinationFactType.OPENING_HOURS,
        DestinationFactType.TICKET_PRICE,
        DestinationFactType.ADDRESS,
        DestinationFactType.COORDINATES,
        DestinationFactType.OFFICIAL_URL,
        DestinationFactType.OPERATIONAL_STATUS,
        DestinationFactType.VISIT_DURATION,
      ]
    )
    const factAwareEligible = eligible.map((candidate) =>
      enhanceCandidateWithFacts(candidate, effectiveFacts)
    )
    const ranked = capPerType(
      applyCandidateDiversityControls(
        selectReadyCandidates(rankDestinationCandidates(factAwareEligible, query), query),
        query
      ),
      query.limitPerType ?? DEFAULT_LIMIT_PER_TYPE
    )
    const clusters = groupNearbyCandidates(ranked, DEFAULT_CLUSTER_RADIUS_KM)

    return {
      cityId: query.cityId,
      candidates: ranked,
      clusters,
      nearestNeighbors: buildNearestNeighbors(ranked),
    }
  }
}
