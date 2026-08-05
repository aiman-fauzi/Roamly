import {
  haversineDistanceMeters,
  isValidCoordinate,
  normalizeStringList,
  normalizeText,
  slugify,
} from './normalization'

import type {
  DestinationRecordRejection,
  DestinationRejectionReason,
  NormalizedDestinationRecord,
  RawDestinationRecord,
} from '@/import/types'


export interface NormalizationResult {
  records: NormalizedDestinationRecord[]
  skipped: number
  rejections: DestinationRecordRejection[]
}

function normalizeRecord(raw: RawDestinationRecord): {
  record?: NormalizedDestinationRecord
  reasons: DestinationRejectionReason[]
} {
  const name = normalizeText(raw.name)
  const kind = raw.kind
  const latitude = raw.latitude
  const longitude = raw.longitude

  const reasons: DestinationRejectionReason[] = []
  if (!name) reasons.push('MISSING_NAME')
  if (!kind) reasons.push('UNKNOWN_ENTITY_TYPE')
  if (!raw.sourceId) reasons.push('UNSUPPORTED_ENTITY_TYPE')
  if (latitude === undefined || longitude === undefined) reasons.push('MISSING_COORDINATES')
  if (latitude !== undefined && longitude !== undefined && !isValidCoordinate(latitude, longitude)) {
    reasons.push('INVALID_COORDINATES')
  }

  if (reasons.length > 0 || !name || !kind || !raw.sourceId || latitude === undefined || longitude === undefined) {
    return { reasons }
  }

  const slug = slugify(name)
  if (!slug) return { reasons: ['MISSING_NAME'] }

  const citySlug = raw.citySlug ?? (raw.cityName ? slugify(raw.cityName) : undefined)
  const roundedLatitude = latitude.toFixed(4)
  const roundedLongitude = longitude.toFixed(4)

  return {
    record: {
      source: raw.source,
      sourceId: raw.sourceId,
      kind,
      name,
      slug,
      description: normalizeText(raw.description),
      address: normalizeText(raw.address),
      latitude,
      longitude,
      cityName: normalizeText(raw.cityName),
      citySlug,
      countryName: normalizeText(raw.countryName),
      countrySlug: raw.countrySlug ? slugify(raw.countrySlug) : undefined,
      countryCode: normalizeText(raw.countryCode)?.toUpperCase(),
      countryIso3: normalizeText(raw.countryIso3)?.toUpperCase(),
      currencyCode: normalizeText(raw.currencyCode)?.toUpperCase(),
      phoneCode: normalizeText(raw.phoneCode),
      sourceUrl: normalizeText(raw.sourceUrl),
      websiteUrl: normalizeText(raw.websiteUrl),
      phone: normalizeText(raw.phone),
      priceLevel: raw.priceLevel,
      durationMinutes: raw.durationMinutes,
      category: normalizeText(raw.category),
      cuisines: normalizeStringList(raw.cuisines),
      amenities: normalizeStringList(raw.amenities),
      tags: normalizeStringList(raw.tags),
      images: (raw.images ?? [])
        .filter((image) => normalizeText(image.url))
        .map((image, index) => ({
          url: normalizeText(image.url) as string,
          altText: normalizeText(image.altText),
          caption: normalizeText(image.caption),
          attribution: normalizeText(image.attribution),
          isPrimary: image.isPrimary ?? index === 0,
        })),
      openingHours: (raw.openingHours ?? [])
        .filter((hour) => hour.dayOfWeek >= 0 && hour.dayOfWeek <= 6)
        .map((hour) => ({
          dayOfWeek: hour.dayOfWeek,
          opensAt: normalizeText(hour.opensAt),
          closesAt: normalizeText(hour.closesAt),
          isClosed: hour.isClosed ?? false,
          note: normalizeText(hour.note),
        })),
      fingerprint: `${kind}:${citySlug ?? raw.cityName ?? 'unknown'}:${slug}:${roundedLatitude}:${roundedLongitude}`,
    },
    reasons: [],
  }
}

function isDuplicate(
  candidate: NormalizedDestinationRecord,
  existing: NormalizedDestinationRecord
): boolean {
  if (candidate.fingerprint === existing.fingerprint) return true
  if (candidate.kind !== existing.kind || candidate.slug !== existing.slug) return false

  return (
    haversineDistanceMeters(
      candidate.latitude,
      candidate.longitude,
      existing.latitude,
      existing.longitude
    ) < 75
  )
}

export function normalizeAndDedupe(rawRecords: RawDestinationRecord[]): NormalizationResult {
  let skipped = 0
  const records: NormalizedDestinationRecord[] = []
  const rejections: DestinationRecordRejection[] = []

  for (const rawRecord of rawRecords) {
    const normalized = normalizeRecord(rawRecord)
    if (!normalized.record) {
      skipped += 1
      rejections.push({
        sourceId: rawRecord.sourceId,
        name: rawRecord.name,
        status: 'REJECT',
        rejectionReasons: normalized.reasons,
      })
      continue
    }

    if (records.some((record) => isDuplicate(normalized.record as NormalizedDestinationRecord, record))) {
      skipped += 1
      rejections.push({
        sourceId: rawRecord.sourceId,
        name: normalized.record.name,
        status: 'REJECT',
        rejectionReasons: ['DUPLICATE_SOURCE_RECORD'],
      })
      continue
    }

    records.push(normalized.record)
  }

  return { records, skipped, rejections }
}
