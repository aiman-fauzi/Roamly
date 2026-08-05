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
import type {
  CandidateEnrichmentState,
  CandidateFactualStatus,
  DestinationCandidate,
  DestinationEntityType,
  DestinationFactSourceContext,
  DestinationOpeningHourContext,
  DestinationPriceConfidence,
  DestinationTicketPriceContext,
  DestinationRetrievalQuery,
  DestinationRetrievalResult,
  RankedDestinationCandidate,
} from '@/services/destinations/types'

const DEFAULT_LIMIT_PER_TYPE = 8
const DEFAULT_CLUSTER_RADIUS_KM = 2

const KNOWN_CITY_CENTERS: Record<string, GeoPoint> = {
  'malaysia:kuala-lumpur': { latitude: 3.1394, longitude: 101.6893 },
}

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

function priceConfidenceFromPrices(prices: DestinationTicketPriceContext[]): DestinationPriceConfidence {
  if (prices.length === 0) return 'PRICE_UNKNOWN'
  const generalPrice = prices.find((price) => price.audience === 'GENERAL') ?? (prices.length === 1 ? prices[0] : undefined)
  if (!generalPrice) return 'PRICE_UNKNOWN'
  if (generalPrice.priceType === 'FREE' || generalPrice.priceType === 'FIXED') return 'KNOWN_PRICE'
  if (generalPrice.priceType === 'FROM' || generalPrice.priceType === 'RANGE') return 'ESTIMATED_PRICE'
  return 'PRICE_UNKNOWN'
}

function sourceSummary(factType: DestinationFactType, fact: EffectiveDestinationFact): DestinationFactSourceContext {
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

function currentFactualStatus(
  statuses: CandidateFactualStatus[]
): CandidateFactualStatus {
  if (statuses.includes('STALE')) return 'STALE'
  if (statuses.includes('VERIFIED')) return 'VERIFIED'
  if (statuses.includes('PARTIAL')) return 'PARTIAL'
  return 'UNKNOWN'
}

function factualCompletenessScore(row: BaseEntityRow, tags: string[], categories: string[]): number {
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
  categories: string[]
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
    name: row.name,
    slug: row.slug,
    description: row.description,
    address: row.address,
    latitude,
    longitude,
    websiteUrl: row.websiteUrl,
    source,
    sourceUrl: row.websiteUrl,
    categories,
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
  else if (candidate.openingHoursStatus === 'PARTIAL' || candidate.openingHoursStatus === 'STALE') score += 8
  if (candidate.ticketPriceStatus === 'VERIFIED') score += 10
  else if (candidate.ticketPriceStatus === 'PARTIAL' || candidate.ticketPriceStatus === 'STALE') score += 4
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
  if (latitude == null || longitude == null || !isValidGeoPoint({ latitude, longitude })) return undefined
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

  const openingHoursFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.OPENING_HOURS))
  if (openingHoursFact) {
    const openingHours = openingHoursFromFact(openingHoursFact)
    next.openingHours = openingHours
    next.openingHoursKnown = openingHours.length > 0
    next.openingHoursStatus = openingHoursFact.status
    summaries.push(sourceSummary(DestinationFactType.OPENING_HOURS, openingHoursFact))
  }

  const ticketPriceFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.TICKET_PRICE))
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

  const coordinatesFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.COORDINATES))
  if (coordinatesFact) {
    Object.assign(next, coordinatesFromFact(coordinatesFact))
    summaries.push(sourceSummary(DestinationFactType.COORDINATES, coordinatesFact))
  }

  const officialUrlFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.OFFICIAL_URL))
  if (officialUrlFact) {
    next.officialUrl = stringValueFromFact(officialUrlFact) ?? next.officialUrl
    next.officialUrlStatus = officialUrlFact.status
    summaries.push(sourceSummary(DestinationFactType.OFFICIAL_URL, officialUrlFact))
  }

  const operationalStatusFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.OPERATIONAL_STATUS))
  if (operationalStatusFact) {
    summaries.push(sourceSummary(DestinationFactType.OPERATIONAL_STATUS, operationalStatusFact))
  }

  const visitDurationFact = effectiveFacts.get(destinationFactKey(ref, DestinationFactType.VISIT_DURATION))
  if (visitDurationFact) {
    next.durationMinutes = durationFromFact(visitDurationFact) ?? next.durationMinutes
    summaries.push(sourceSummary(DestinationFactType.VISIT_DURATION, visitDurationFact))
  }

  next.lastVerifiedAt = latestFactTimestamp(candidate.lastVerifiedAt, summaries)
  next.staleFactCount = summaries.filter((summary) => summary.stale || summary.status === 'STALE').length
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

function countTermMatches(text: string, terms: string[]): number {
  return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))].filter((term) =>
    text.includes(term.replace(/_/g, ' '))
  ).length
}

function sourceScore(candidate: DestinationCandidate): number {
  if (candidate.source === DestinationImportSource.OPENSTREETMAP) return 15
  if (candidate.source === DestinationImportSource.WIKIVOYAGE) return 14
  if (candidate.source === DestinationImportSource.GOVERNMENT_TOURISM) return 13
  return 7
}

function completenessScore(candidate: DestinationCandidate): number {
  return Math.min(20, Math.round(candidate.factualCompletenessScore * 0.2))
}

function geographicScore(candidate: DestinationCandidate): number {
  const distance = candidate.distanceFromCityCenterKm
  if (distance == null) return 12
  if (distance <= 5) return 20
  if (distance <= 12) return 18
  if (distance <= 25) return 15
  if (distance <= 45) return 8
  return 0
}

function enrichmentScore(candidate: DestinationCandidate): number {
  if (candidate.enrichmentState === 'ENRICHED') return 15
  if (candidate.enrichmentState === 'PARTIALLY_ENRICHED') return 8
  return 4
}

function interestScore(candidate: DestinationCandidate, interests: string[]): { score: number; matches: number } {
  const matches = countTermMatches(searchableText(candidate), interests)
  return { score: Math.min(matches * 5, 15), matches }
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
  if (normalized === 'budget' && (candidate.priceLevel == null || candidate.priceLevel <= 2)) return 5
  if (normalized === 'luxury' && candidate.priceLevel != null && candidate.priceLevel >= 4) return 5
  if (normalized === 'moderate' && candidate.priceLevel != null && candidate.priceLevel >= 2 && candidate.priceLevel <= 3) {
    return 5
  }
  return 1
}

function duplicatePenalty(
  candidate: DestinationCandidate,
  previous: RankedDestinationCandidate[]
): { penalty: number; reason?: string } {
  const duplicate = previous.find((other) => {
    if (other.entityType !== candidate.entityType) return false
    const distance = haversineDistanceKm(
      { latitude: other.latitude, longitude: other.longitude },
      { latitude: candidate.latitude, longitude: candidate.longitude }
    )
    return other.slug === candidate.slug || distance < 0.08
  })

  return duplicate
    ? { penalty: 20, reason: `Possible duplicate of ${duplicate.name}` }
    : { penalty: 0 }
}

export function rankDestinationCandidates(
  candidates: DestinationCandidate[],
  query: DestinationRetrievalQuery
): RankedDestinationCandidate[] {
  const ranked: RankedDestinationCandidate[] = []
  const sortedInput = [...candidates].sort((first, second) => first.name.localeCompare(second.name))

  for (const candidate of sortedInput) {
    const interests = query.interests ?? []
    const travelStyles = query.travelStyles ?? []
    const interest = interestScore(candidate, interests)
    const style = travelStyleScore(candidate, travelStyles)
    const duplicate = duplicatePenalty(candidate, ranked)
    const score = Math.max(
      0,
      Math.min(
        100,
        sourceScore(candidate) +
          completenessScore(candidate) +
          geographicScore(candidate) +
          enrichmentScore(candidate) +
          interest.score +
          style.score +
          budgetScore(candidate, query.budgetLevel) -
          Math.min(candidate.staleFactCount * 2, 6) -
          duplicate.penalty
      )
    )
    const rankReasons = [
      `${candidate.source.toLowerCase()} source`,
      `${candidate.enrichmentState.toLowerCase()} data`,
      `${candidate.distanceFromCityCenterKm ?? 'unknown'} km from city center`,
    ]

    if (interest.matches > 0) rankReasons.push(`${interest.matches} interest match${interest.matches === 1 ? '' : 'es'}`)
    if (style.matches.length > 0) rankReasons.push(`matches ${style.matches.join(', ')} travel style`)
    if (candidate.priceConfidence !== 'PRICE_UNKNOWN') rankReasons.push(candidate.priceConfidence.toLowerCase())
    if (candidate.openingHoursKnown) rankReasons.push(`opening_hours_${candidate.openingHoursStatus.toLowerCase()}`)
    if (candidate.ticketPriceStatus !== 'UNKNOWN') rankReasons.push(`ticket_price_${candidate.ticketPriceStatus.toLowerCase()}`)
    if (candidate.staleFactCount > 0) rankReasons.push(`${candidate.staleFactCount} stale fact marker${candidate.staleFactCount === 1 ? '' : 's'}`)
    if (duplicate.reason) rankReasons.push(duplicate.reason)

    ranked.push({
      ...candidate,
      rankScore: Number(score.toFixed(1)),
      rankReasons,
    })
  }

  return ranked.sort((first, second) => second.rankScore - first.rankScore || first.name.localeCompare(second.name))
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
  const normalized = slugify(destination)
  const city = await db.city.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: normalized },
        { name: { equals: destination.trim(), mode: 'insensitive' } },
        { name: { contains: destination.trim(), mode: 'insensitive' } },
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
        where: { cityId: query.cityId, deletedAt: null, city: { deletedAt: null, country: { deletedAt: null } } },
        include: {
          city: { include: { country: true } },
          tags: true,
          openingHours: { where: { deletedAt: null }, orderBy: { dayOfWeek: 'asc' } },
          enrichment: true,
        },
      })
      candidates.push(
        ...rows
          .map((row) => mapBaseCandidate(row, 'ATTRACTION', []))
          .filter((candidate): candidate is DestinationCandidate => Boolean(candidate))
      )
    }

    if (includeTypes.includes('RESTAURANT')) {
      const rows = await this.db.restaurant.findMany({
        where: { cityId: query.cityId, deletedAt: null, city: { deletedAt: null, country: { deletedAt: null } } },
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
        where: { cityId: query.cityId, deletedAt: null, city: { deletedAt: null, country: { deletedAt: null } } },
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
        where: { cityId: query.cityId, deletedAt: null, city: { deletedAt: null, country: { deletedAt: null } } },
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
    const factAwareEligible = eligible.map((candidate) => enhanceCandidateWithFacts(candidate, effectiveFacts))
    const ranked = capPerType(
      rankDestinationCandidates(factAwareEligible, query),
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
