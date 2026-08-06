import { createHash } from 'node:crypto'

import { haversineDistanceMeters, slugify } from '@/import/normalization'
import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import type {
  DestinationImportCategory,
  DestinationNames,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'

export function normalizeCandidateName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeAliasList(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => (value ? normalizeCandidateName(value) : ''))
        .filter((value) => value.length > 0)
    ),
  ]
}

export function normalizeNameIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeNameIdentityKeys(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  for (const value of values) {
    if (!value) continue
    const latinKey = normalizeCandidateName(value)
    const unicodeKey = normalizeNameIdentity(value)
    if (isUsefulNameIdentityKey(latinKey)) keys.add(latinKey)
    if (isUsefulNameIdentityKey(unicodeKey)) keys.add(unicodeKey)
  }
  return [...keys]
}

function isUsefulNameIdentityKey(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  if (compact.length < 3) return false
  if (/^\d+$/.test(compact)) return false
  return true
}

export function splitAliasValues(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    const key = normalizeNameIdentity(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

export function isCoordinateInsideArea(area: DestinationImportArea, latitude: number, longitude: number): boolean {
  return (
    latitude >= area.boundingBox.south &&
    latitude <= area.boundingBox.north &&
    longitude >= area.boundingBox.west &&
    longitude <= area.boundingBox.east
  )
}

export function validCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

export function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
): number {
  return haversineDistanceMeters(first.latitude, first.longitude, second.latitude, second.longitude)
}

export function sourceContentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function destinationSlug(name: string): string {
  return slugify(name).slice(0, 220)
}

export function categoryFromOsmTags(tags: Record<string, string | undefined>): DestinationImportCategory | null {
  const tourism = tags.tourism
  const historic = tags.historic
  const heritage = tags.heritage
  const natural = tags.natural
  const leisure = tags.leisure
  const amenity = tags.amenity
  const shop = tags.shop

  if (historic) return 'historic'
  if (heritage) return 'heritage'
  if (amenity === 'place_of_worship') return 'place_of_worship'
  if (amenity === 'marketplace' || shop === 'marketplace') return 'market'
  if (amenity === 'arts_centre' || amenity === 'theatre') return 'cultural_venue'
  if (leisure === 'park') return 'park'
  if (leisure === 'nature_reserve') return 'nature_reserve'
  if (natural === 'beach') return 'beach'
  if (natural === 'peak') return 'peak'
  if (natural === 'waterfall') return 'waterfall'
  if (tourism === 'museum') return 'museum'
  if (tourism === 'gallery') return 'gallery'
  if (tourism === 'viewpoint') return 'viewpoint'
  if (tourism === 'zoo') return 'zoo'
  if (tourism === 'aquarium') return 'aquarium'
  if (tourism === 'theme_park') return 'theme_park'
  if (tourism === 'artwork') return 'artwork'
  if (tourism === 'attraction') return 'landmark'
  if (tourism === 'information') return null
  return null
}

const GENERIC_NAMES = new Set([
  'attraction',
  'beach',
  'gallery',
  'landmark',
  'market',
  'museum',
  'park',
  'temple',
  'viewpoint',
  'waterfall',
])

const CHAIN_OR_GENERIC_BUSINESS_TERMS = [
  '7 eleven',
  'atm',
  'bank',
  'burger king',
  'familymart',
  'kfc',
  'mcdonald',
  'starbucks',
  'subway',
]

const GENERIC_ORGANIZATION_TERMS = [
  'centre',
  'center',
  'department',
  'foundation',
  'hall',
  'institute',
  'office',
]

const COMMERCIAL_AMENITIES = new Set([
  'atm',
  'bank',
  'bar',
  'cafe',
  'fast_food',
  'fuel',
  'pharmacy',
  'restaurant',
])

const TRANSPORT_TERMS = ['airport', 'bus terminal', 'ferry terminal', 'metro station', 'railway station', 'train station']

const STRONG_TOURISM_VALUES = new Set(['museum', 'gallery', 'viewpoint', 'zoo', 'aquarium', 'theme_park', 'artwork'])
const CULTURAL_AMENITIES = new Set(['arts_centre', 'theatre', 'place_of_worship'])
const CULTURAL_CATEGORIES = new Set<DestinationImportCategory>([
  'museum',
  'gallery',
  'artwork',
  'historic',
  'heritage',
  'aquarium',
  'beach',
  'market',
  'nature_reserve',
  'park',
  'peak',
  'place_of_worship',
  'theme_park',
  'viewpoint',
  'waterfall',
  'zoo',
  'cultural_venue',
])

export function isGenericName(name: string): boolean {
  return GENERIC_NAMES.has(normalizeCandidateName(name))
}

export function validWikidataId(value: string | null | undefined): boolean {
  return Boolean(value && /^Q\d+$/.test(value))
}

export function validWikipediaTag(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z][a-z-]*:.+/.test(value)
}

export function verifiedWebsiteUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function tagValue(tags: Record<string, unknown>, key: string): string | null {
  const value = tags[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function strongIdentitySignals(candidate: {
  normalizedName: string
  nameIdentityKeys?: string[]
  wikidataId: string | null
  wikipediaUrl?: string | null
  websiteUrl: string | null
  category?: DestinationImportCategory
  rawTags: Record<string, unknown>
}): string[] {
  const tags = candidate.rawTags
  const tourism = tagValue(tags, 'tourism')
  const amenity = tagValue(tags, 'amenity')
  const signals: string[] = []

  if (tourism && STRONG_TOURISM_VALUES.has(tourism)) signals.push(`tourism=${tourism}`)
  if (tagValue(tags, 'museum')) signals.push('museum=*')
  if (amenity && CULTURAL_AMENITIES.has(amenity)) signals.push(`amenity=${amenity}`)
  if (tagValue(tags, 'historic')) signals.push('historic=*')
  if (tagValue(tags, 'heritage')) signals.push('heritage=*')
  if (validWikidataId(candidate.wikidataId ?? tagValue(tags, 'wikidata'))) signals.push('wikidata')
  if (candidate.wikipediaUrl || validWikipediaTag(tagValue(tags, 'wikipedia'))) signals.push('wikipedia')
  if (verifiedWebsiteUrl(candidate.websiteUrl)) signals.push('website')
  if (candidate.category && CULTURAL_CATEGORIES.has(candidate.category)) signals.push(`category=${candidate.category}`)
  if (tagValue(tags, 'wikimedia_commons')) signals.push('wikimedia_commons')

  return [...new Set(signals)]
}

export function hasStrongIdentitySignal(candidate: {
  normalizedName: string
  nameIdentityKeys?: string[]
  wikidataId: string | null
  wikipediaUrl?: string | null
  websiteUrl: string | null
  category?: DestinationImportCategory
  rawTags: Record<string, unknown>
}): boolean {
  if (strongIdentitySignals(candidate).length > 0) return true
  const identityKeys = candidate.nameIdentityKeys ?? [candidate.normalizedName].filter(Boolean)
  return identityKeys.some((key) => key.split(' ').filter(Boolean).length >= 2)
}

export function chainOrGenericBusinessAssessment(candidate: NormalizedDestinationCandidate): {
  isGenericBusiness: boolean
  matchedTerms: string[]
  supportingSignals: string[]
  strongIdentitySignals: string[]
} {
  const normalized = normalizeCandidateName(candidate.name)
  const matchedChainTerms = CHAIN_OR_GENERIC_BUSINESS_TERMS.filter((term) => normalized.includes(term))
  const matchedGenericTerms = GENERIC_ORGANIZATION_TERMS.filter((term) => normalized.includes(term))
  const matchedTerms = [...matchedChainTerms, ...matchedGenericTerms]
  const tags = candidate.rawTags
  const amenity = tagValue(tags, 'amenity')
  const shop = tagValue(tags, 'shop')
  const office = tagValue(tags, 'office')
  const brand = tagValue(tags, 'brand') ?? tagValue(tags, 'brand:wikidata')
  const strongSignals = strongIdentitySignals(candidate)
  const supportingSignals: string[] = []

  if (amenity && COMMERCIAL_AMENITIES.has(amenity)) supportingSignals.push(`amenity=${amenity}`)
  if (shop) supportingSignals.push(`shop=${shop}`)
  if (office) supportingSignals.push(`office=${office}`)
  if (brand) supportingSignals.push('brand')
  if (candidate.category === 'other') supportingSignals.push('category=other')
  if (strongSignals.length === 0) supportingSignals.push('no_strong_identity')
  if (matchedChainTerms.length > 0) supportingSignals.push('chain_name')
  if (matchedGenericTerms.length > 0) supportingSignals.push('generic_org_name')

  const genericBusiness =
    matchedTerms.length > 0 &&
    strongSignals.length === 0 &&
    supportingSignals.length >= 2 &&
    (matchedChainTerms.length > 0 || Boolean(amenity || shop || office || brand))

  return {
    isGenericBusiness: genericBusiness,
    matchedTerms,
    supportingSignals: [...new Set(supportingSignals)],
    strongIdentitySignals: strongSignals,
  }
}

export function isChainOrGenericBusiness(candidate: NormalizedDestinationCandidate): boolean {
  return chainOrGenericBusinessAssessment(candidate).isGenericBusiness
}

export function isTransportOnlyName(name: string): boolean {
  const normalized = normalizeCandidateName(name)
  return TRANSPORT_TERMS.some((term) => normalized.includes(term))
}

export function isTransportOnlyTags(tags: Record<string, unknown>): boolean {
  const amenity = typeof tags.amenity === 'string' ? tags.amenity : ''
  const publicTransport = typeof tags.public_transport === 'string' ? tags.public_transport : ''
  const railway = typeof tags.railway === 'string' ? tags.railway : ''
  const aeroway = typeof tags.aeroway === 'string' ? tags.aeroway : ''
  return Boolean(
    ['bus_station', 'ferry_terminal', 'parking', 'taxi'].includes(amenity) ||
      publicTransport ||
      railway ||
      aeroway
  )
}

export function transportOnlyAssessment(candidate: NormalizedDestinationCandidate): {
  isTransportOnly: boolean
  transportSignals: string[]
  independentIdentitySignals: string[]
} {
  const tags = candidate.rawTags
  const amenity = tagValue(tags, 'amenity')
  const publicTransport = tagValue(tags, 'public_transport')
  const railway = tagValue(tags, 'railway')
  const aeroway = tagValue(tags, 'aeroway')
  const ferry = tagValue(tags, 'ferry')
  const entrance = tagValue(tags, 'entrance')
  const transportSignals: string[] = []

  if (amenity && ['bus_station', 'ferry_terminal', 'parking', 'taxi'].includes(amenity)) {
    transportSignals.push(`amenity=${amenity}`)
  }
  if (publicTransport) transportSignals.push(`public_transport=${publicTransport}`)
  if (railway) transportSignals.push(`railway=${railway}`)
  if (aeroway) transportSignals.push(`aeroway=${aeroway}`)
  if (ferry) transportSignals.push(`ferry=${ferry}`)
  if (entrance && (publicTransport || railway || aeroway)) transportSignals.push(`entrance=${entrance}`)

  const independentSignals = strongIdentitySignals(candidate).filter((signal) => signal !== 'category=landmark')
  const tourism = tagValue(tags, 'tourism')
  const onlyWeakTourismAttraction = tourism === 'attraction' && independentSignals.length === 0

  return {
    isTransportOnly: transportSignals.length > 0 && (independentSignals.length === 0 || onlyWeakTourismAttraction),
    transportSignals: [...new Set(transportSignals)],
    independentIdentitySignals: independentSignals,
  }
}

export function buildDestinationNames(input: {
  tags: Record<string, string | undefined>
  countryCode: string
}): DestinationNames | null {
  const { tags, countryCode } = input
  const languages = Object.fromEntries(
    Object.entries(tags)
      .filter(([key, value]) => key.startsWith('name:') && Boolean(value?.trim()))
      .map(([key, value]) => [key.slice('name:'.length).toLowerCase(), value as string])
  )
  const localLanguagePriority: Record<string, string[]> = {
    BN: ['ms'],
    KH: ['km'],
    ID: ['id'],
    LA: ['lo'],
    MY: ['ms'],
    MM: ['my'],
    PH: ['fil', 'tl'],
    SG: ['en', 'ms', 'zh', 'ta'],
    TH: ['th'],
    TL: ['tet', 'pt'],
    VN: ['vi'],
  }
  const local = (localLanguagePriority[countryCode] ?? [])
    .map((language) => languages[language])
    .find((value): value is string => Boolean(value?.trim())) ?? null
  const english = languages.en ?? null
  const primary = tags.name ?? local ?? english ?? tags.official_name ?? tags.alt_name ?? null
  if (!primary?.trim()) return null

  const aliases = uniqueStrings([
    ...splitAliasValues(tags.alt_name),
    ...splitAliasValues(tags.official_name),
    ...splitAliasValues(tags.short_name),
    ...Object.values(languages),
  ]).filter((alias) => normalizeNameIdentity(alias) !== normalizeNameIdentity(primary))

  return {
    primary,
    local: local ?? (tags.name && tags.name !== english ? tags.name : null),
    english,
    aliases,
    languages,
  }
}

export function candidateNameIdentityKeys(candidate: Pick<NormalizedDestinationCandidate, 'name' | 'names' | 'aliases' | 'normalizedName' | 'nameIdentityKeys'>): string[] {
  return candidate.nameIdentityKeys.length > 0
    ? candidate.nameIdentityKeys
    : normalizeNameIdentityKeys([
        candidate.name,
        candidate.names.local,
        candidate.names.english,
        ...candidate.names.aliases,
        ...candidate.aliases,
        candidate.normalizedName,
      ])
}
