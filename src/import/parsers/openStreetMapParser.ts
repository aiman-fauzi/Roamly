import { asNumber, asRecordArray, asString, isRecord, parseJsonObject } from './helpers'

import type { DestinationKind, DestinationParser, ImportSourceConfig, RawDestinationRecord } from '@/import/types'


type OsmTags = Record<string, string | undefined>

function readTags(value: unknown): OsmTags {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, typeof entry === 'string' ? entry : undefined])
  )
}

function inferKind(tags: OsmTags): DestinationKind | undefined {
  if (tags.tourism === 'hotel' || tags.tourism === 'hostel' || tags.tourism === 'guest_house') return 'HOTEL'
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food') return 'RESTAURANT'
  if (tags.tourism || tags.historic || tags.amenity === 'place_of_worship') return 'ATTRACTION'
  if (tags.leisure || tags.sport || tags.shop || tags.natural) return 'ACTIVITY'
  return undefined
}

function buildAddress(tags: OsmTags): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
  return [street, tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']]
    .filter(Boolean)
    .join(', ') || undefined
}

function readCoordinates(element: Record<string, unknown>): { latitude?: number; longitude?: number } {
  const latitude = asNumber(element.lat)
  const longitude = asNumber(element.lon)
  if (latitude !== undefined && longitude !== undefined) return { latitude, longitude }

  if (isRecord(element.center)) {
    return {
      latitude: asNumber(element.center.lat),
      longitude: asNumber(element.center.lon),
    }
  }

  return {}
}

export class OpenStreetMapParser implements DestinationParser {
  parse(payload: string, config: ImportSourceConfig): RawDestinationRecord[] {
    const data = parseJsonObject(payload)
    if (!isRecord(data)) return []

    return asRecordArray(data.elements).flatMap((element) => {
      const tags = readTags(element.tags)
      const name = tags['name:en'] ?? tags.name
      const kind = inferKind(tags) ?? config.defaultKind
      const id = asString(element.id) ?? (typeof element.id === 'number' ? String(element.id) : undefined)
      const type = asString(element.type) ?? 'element'
      const coordinates = readCoordinates(element)

      if (!name || !kind || !id) return []

      return [
        {
          source: config.source,
          sourceId: `osm:${type}:${id}`,
          name,
          kind,
          description: tags.description ?? tags['description:en'],
          address: buildAddress(tags),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          cityName: tags['addr:city'] ?? config.cityName,
          citySlug: config.citySlug,
          countryName: config.countryName,
          countryCode: tags['addr:country'] ?? config.countryCode,
          countrySlug: config.countrySlug,
          countryIso3: config.countryIso3,
          currencyCode: config.currencyCode,
          phoneCode: config.phoneCode,
          sourceUrl: config.url,
          websiteUrl: tags.website ?? tags['contact:website'],
          phone: tags.phone ?? tags['contact:phone'],
          category: tags.tourism ?? tags.amenity ?? tags.leisure ?? tags.historic ?? tags.natural,
          cuisines: tags.cuisine ? [tags.cuisine] : [],
          tags: [tags.tourism, tags.amenity, tags.leisure, tags.historic, tags.natural, tags.cuisine].filter((tag): tag is string => Boolean(tag)),
          raw: element,
        },
      ]
    })
  }
}
