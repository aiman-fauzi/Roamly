import { asNumber, asRecordArray, asString, isRecord, parseJsonObject } from './helpers'

import { slugify } from '@/import/normalization'
import type { DestinationKind, DestinationParser, ImportSourceConfig, RawDestinationRecord } from '@/import/types'



function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

function parseCsv(payload: string): Array<Record<string, unknown>> {
  const lines = payload.split(/\r?\n/).filter((line) => line.trim())
  const headers = parseCsvLine(lines[0] ?? '').map((header) => header.trim())
  if (headers.length === 0) return []

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
  })
}

function readRows(payload: string): Array<Record<string, unknown>> {
  const json = parseJsonObject(payload)
  if (Array.isArray(json)) return json.filter(isRecord)
  if (isRecord(json)) {
    if (json.type === 'FeatureCollection') return asRecordArray(json.features)
    for (const key of ['data', 'records', 'results', 'items']) {
      const rows = asRecordArray(json[key])
      if (rows.length > 0) return rows
    }
  }

  return parseCsv(payload)
}

function readField(row: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const value = asString(row[name])
    if (value) return value
  }
  return undefined
}

function readNumberField(row: Record<string, unknown>, names: string[]): number | undefined {
  for (const name of names) {
    const value = asNumber(row[name])
    if (value !== undefined) return value
  }
  return undefined
}

function inferKind(value: string | undefined, fallback: DestinationKind | undefined): DestinationKind {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('hotel') || normalized.includes('accommodation')) return 'HOTEL'
  if (normalized.includes('restaurant') || normalized.includes('food') || normalized.includes('dining')) return 'RESTAURANT'
  if (normalized.includes('activity') || normalized.includes('tour') || normalized.includes('experience')) return 'ACTIVITY'
  return fallback ?? 'ATTRACTION'
}

function flattenFeature(row: Record<string, unknown>): Record<string, unknown> {
  if (row.type !== 'Feature') return row
  const properties = isRecord(row.properties) ? row.properties : {}
  if (isRecord(row.geometry) && Array.isArray(row.geometry.coordinates)) {
    const [longitude, latitude] = row.geometry.coordinates
    return { ...properties, latitude, longitude }
  }
  return properties
}

export class GovernmentTourismParser implements DestinationParser {
  parse(payload: string, config: ImportSourceConfig): RawDestinationRecord[] {
    return readRows(payload).flatMap((rawRow, index) => {
      const row = flattenFeature(rawRow)
      const name = readField(row, ['name', 'title', 'Name', 'Title', 'business_name', 'attraction_name'])
      if (!name) return []

      const type = readField(row, ['kind', 'type', 'category', 'Category', 'classification'])
      const sourceId = readField(row, ['id', 'uuid', 'source_id', 'external_id']) ?? `${config.sourceKey}:${slugify(name)}:${index}`

      return [
        {
          source: config.source,
          sourceId: `government:${sourceId}`,
          name,
          kind: inferKind(type, config.defaultKind),
          description: readField(row, ['description', 'Description', 'summary', 'Overview']),
          address: readField(row, ['address', 'Address', 'street_address', 'location']),
          latitude: readNumberField(row, ['latitude', 'lat', 'Latitude', 'LATITUDE']),
          longitude: readNumberField(row, ['longitude', 'lon', 'lng', 'Longitude', 'LONGITUDE']),
          cityName: readField(row, ['city', 'City', 'municipality']) ?? config.cityName,
          citySlug: config.citySlug,
          countryName: readField(row, ['country', 'Country', 'country_name', 'countryName']) ?? config.countryName,
          countryCode: readField(row, ['country_code', 'countryCode']) ?? config.countryCode,
          countrySlug: config.countrySlug,
          countryIso3: readField(row, ['country_iso3', 'countryIso3']) ?? config.countryIso3,
          currencyCode: readField(row, ['currency_code', 'currencyCode']) ?? config.currencyCode,
          phoneCode: readField(row, ['phone_code', 'phoneCode']) ?? config.phoneCode,
          sourceUrl: config.url,
          websiteUrl: readField(row, ['website', 'url', 'Website', 'website_url']),
          phone: readField(row, ['phone', 'telephone', 'Phone']),
          category: type,
          tags: [type, readField(row, ['sub_category', 'subcategory'])].filter((tag): tag is string => Boolean(tag)),
          raw: rawRow,
        },
      ]
    })
  }
}
