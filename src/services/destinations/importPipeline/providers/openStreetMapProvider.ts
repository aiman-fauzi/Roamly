import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import { DestinationImportHttpClient } from '@/services/destinations/importPipeline/httpClient'
import type { NormalizedDestinationCandidate } from '@/services/destinations/importPipeline/types'
import {
  buildDestinationNames,
  categoryFromOsmTags,
  normalizeCandidateName,
  normalizeNameIdentityKeys,
} from '@/services/destinations/importPipeline/utils'
import { assertDestinationSourceUsable, attributionForSource } from '@/services/destinations/sources/sourceRegistry'

type OsmTags = Record<string, string | undefined>

interface OsmElement {
  type?: string
  id?: number | string
  lat?: number
  lon?: number
  center?: {
    lat?: number
    lon?: number
  }
  tags?: Record<string, unknown>
}

interface OsmPayload {
  elements?: OsmElement[]
}

export interface OpenStreetMapDiscoveryOptions {
  area: DestinationImportArea
  limit: number
  httpClient?: DestinationImportHttpClient
}

function escapeOverpass(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function bbox(area: DestinationImportArea): string {
  const { south, west, north, east } = area.boundingBox
  return `${south},${west},${north},${east}`
}

export function buildOpenStreetMapAttractionQuery(area: DestinationImportArea, limit: number): string {
  const areaBox = bbox(area)
  const relationClause = area.osmRelationId
    ? `rel(${escapeOverpass(area.osmRelationId)}); map_to_area -> .searchArea;`
    : ''
  const selectorArea = area.osmRelationId ? '(area.searchArea)' : `(${areaBox})`

  return `
[out:json][timeout:45];
${relationClause}
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park|artwork)$"]${selectorArea};
  nwr["historic"]${selectorArea};
  nwr["heritage"]${selectorArea};
  nwr["natural"~"^(beach|peak|waterfall)$"]${selectorArea};
  nwr["leisure"~"^(park|nature_reserve)$"]${selectorArea};
  nwr["amenity"="place_of_worship"]${selectorArea};
  nwr["amenity"~"^(arts_centre|theatre|marketplace)$"]${selectorArea};
  nwr["shop"="marketplace"]${selectorArea};
);
out center tags ${Math.max(1, Math.min(limit, 500))};
`.trim()
}

function parseOsmPayload(payload: string): OsmPayload {
  const parsed = JSON.parse(payload) as unknown
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed as OsmPayload
}

function readTags(element: OsmElement): OsmTags {
  if (!element.tags || typeof element.tags !== 'object') return {}
  return Object.fromEntries(
    Object.entries(element.tags).map(([key, value]) => [key, typeof value === 'string' ? value : undefined])
  )
}

function readCoordinate(element: OsmElement): { latitude: number; longitude: number } | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { latitude: element.lat, longitude: element.lon }
  }
  if (typeof element.center?.lat === 'number' && typeof element.center.lon === 'number') {
    return { latitude: element.center.lat, longitude: element.center.lon }
  }
  return null
}

function sourceUrl(type: string, id: string): string {
  return `https://www.openstreetmap.org/${type}/${id}`
}

function wikipediaUrlFromTag(value: string | undefined): string | null {
  if (!value) return null
  const [language, ...titleParts] = value.split(':')
  const title = titleParts.join(':')
  if (!language || !title) return null
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
}

function normalizeOsmElement(element: OsmElement, area: DestinationImportArea, discoveredAt: Date): NormalizedDestinationCandidate | null {
  const tags = readTags(element)
  const names = buildDestinationNames({ tags, countryCode: area.countryCode })
  const type = element.type ?? 'node'
  const id = element.id == null ? null : String(element.id)
  const coordinates = readCoordinate(element)
  const category = categoryFromOsmTags(tags)
  if (!names || !id || !coordinates || !category) return null

  const name = names.primary
  const normalizedName = normalizeCandidateName(name)
  const aliases = normalizeNameIdentityKeys([
    names.local,
    names.english,
    ...names.aliases,
    ...Object.values(names.languages),
  ]).filter((alias) => alias !== normalizedName)
  const sourceRecordId = `osm:${type}:${id}`
  const wikimediaCommons = tags.wikimedia_commons?.replace(/^Category:/, '')

  return {
    sourceId: 'openstreetmap-overpass',
    sourceRecordId,
    sourceUrl: sourceUrl(type, id),
    sourceObjectType: type,
    name,
    names,
    normalizedName,
    aliases,
    nameIdentityKeys: normalizeNameIdentityKeys([
      name,
      names.local,
      names.english,
      ...names.aliases,
      ...Object.values(names.languages),
    ]),
    countryCode: area.countryCode,
    countryName: area.countryName,
    countrySlug: area.countrySlug,
    destinationSlug: area.slug,
    locality: tags['addr:city'] ?? tags['addr:suburb'] ?? tags['addr:district'] ?? null,
    administrativeArea: tags['addr:province'] ?? tags['addr:state'] ?? null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    category,
    subcategories: [
      tags.tourism,
      tags.historic,
      tags.heritage,
      tags.natural,
      tags.leisure,
      tags.amenity,
      tags.shop,
    ].filter((tag): tag is string => Boolean(tag)),
    rawTags: tags,
    shortDescription: tags.description ?? tags['description:en'] ?? null,
    websiteUrl: tags.website ?? tags['contact:website'] ?? null,
    phoneNumber: tags.phone ?? tags['contact:phone'] ?? null,
    openingHoursRaw: tags.opening_hours ?? null,
    wikidataId: tags.wikidata ?? null,
    wikipediaUrl: wikipediaUrlFromTag(tags.wikipedia),
    commonsCategory: wikimediaCommons ?? null,
    englishNameSource: names.english ? 'osm:name:en' : null,
    imageUrl: null,
    imagePageUrl: null,
    imageAuthor: null,
    imageLicense: null,
    imageLicenseUrl: null,
    imageAttribution: null,
    contentLicense: assertDestinationSourceUsable('openstreetmap-overpass').licenseName,
    contentAttribution: attributionForSource('openstreetmap-overpass'),
    discoveredAt,
    sourceUpdatedAt: null,
    rawSourcePayload: element,
  }
}

export class OpenStreetMapAttractionProvider {
  constructor(private readonly httpClient = new DestinationImportHttpClient()) {}

  buildUrl(area: DestinationImportArea, limit: number): string {
    const endpoint = process.env.OVERPASS_API_URL ?? assertDestinationSourceUsable('openstreetmap-overpass').baseUrl
    const query = buildOpenStreetMapAttractionQuery(area, limit)
    return `${endpoint}?data=${encodeURIComponent(query)}`
  }

  async discover(options: OpenStreetMapDiscoveryOptions): Promise<NormalizedDestinationCandidate[]> {
    const httpClient = options.httpClient ?? this.httpClient
    const url = this.buildUrl(options.area, options.limit)
    const response = await httpClient.get('openstreetmap-overpass', url, { cacheTtlMs: 60 * 60 * 1000 })
    const payload = parseOsmPayload(response.text)
    const discoveredAt = new Date()

    return (payload.elements ?? [])
      .flatMap((element) => normalizeOsmElement(element, options.area, discoveredAt) ?? [])
  }
}
