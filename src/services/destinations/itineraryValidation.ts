import type {
  DestinationEntityType,
  GeminiDestinationCandidateContext,
  GeminiDestinationContext,
} from '@/services/destinations/types'
import type { Itinerary, ItineraryItem } from '@/types/itinerary'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MIN_DURATION_MINUTES = 15
const MAX_DURATION_MINUTES = 720

export class ItineraryCandidateValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Itinerary candidate contract failed: ${issues.join('; ')}`)
    this.name = 'ItineraryCandidateValidationError'
  }
}

interface ValidationOptions {
  durationDays: number
}

function itineraryItems(itinerary: Itinerary): Array<{ item: ItineraryItem; dayNumber: number }> {
  return itinerary.days.flatMap((day) => [
    ...day.morning.map((item) => ({ item, dayNumber: day.dayNumber })),
    ...day.afternoon.map((item) => ({ item, dayNumber: day.dayNumber })),
    ...day.evening.map((item) => ({ item, dayNumber: day.dayNumber })),
  ])
}

function parseCandidateId(candidateId: string): { entityType: DestinationEntityType; id: string } | null {
  const [entityType, ...rest] = candidateId.split(':')
  if (
    entityType !== 'ATTRACTION' &&
    entityType !== 'RESTAURANT' &&
    entityType !== 'HOTEL' &&
    entityType !== 'ACTIVITY'
  ) {
    return null
  }
  const id = rest.join(':')
  return id ? { entityType, id } : null
}

export function validateItineraryCandidateContract(
  itinerary: Itinerary,
  context: GeminiDestinationContext,
  options: ValidationOptions
): void {
  const issues: string[] = []
  const candidates = new Map(context.candidates.map((candidate) => [candidate.id, candidate]))
  const seenCandidateIds = new Set<string>()

  if (itinerary.days.length !== options.durationDays) {
    issues.push(`Expected ${options.durationDays} days but received ${itinerary.days.length}`)
  }

  for (const day of itinerary.days) {
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || day.dayNumber > options.durationDays) {
      issues.push(`Invalid day number ${day.dayNumber}`)
    }
  }

  for (const { item, dayNumber } of itineraryItems(itinerary)) {
    if (!item.candidateId) {
      issues.push(`Day ${dayNumber} item "${item.title}" is missing candidateId`)
      continue
    }
    if (!candidates.has(item.candidateId)) {
      issues.push(`Day ${dayNumber} item "${item.title}" references unknown candidate ${item.candidateId}`)
      continue
    }
    if (seenCandidateIds.has(item.candidateId)) {
      issues.push(`Candidate ${item.candidateId} is duplicated in the itinerary`)
    }
    seenCandidateIds.add(item.candidateId)

    if (!TIME_PATTERN.test(item.time)) {
      issues.push(`Candidate ${item.candidateId} has invalid start time ${item.time}`)
    }
    if (
      !Number.isInteger(item.durationMinutes) ||
      item.durationMinutes < MIN_DURATION_MINUTES ||
      item.durationMinutes > MAX_DURATION_MINUTES
    ) {
      issues.push(`Candidate ${item.candidateId} has invalid duration ${item.durationMinutes}`)
    }
    if (!item.reason) {
      issues.push(`Candidate ${item.candidateId} is missing a planning reason`)
    }
    if (
      item.priceConfidence !== 'KNOWN_PRICE' &&
      item.priceConfidence !== 'ESTIMATED_PRICE' &&
      item.priceConfidence !== 'PRICE_UNKNOWN'
    ) {
      issues.push(`Candidate ${item.candidateId} has invalid price confidence`)
    }
  }

  if (issues.length > 0) {
    throw new ItineraryCandidateValidationError(issues)
  }
}

function attachItemMetadata(
  item: ItineraryItem,
  candidates: Map<string, GeminiDestinationCandidateContext>
): ItineraryItem {
  const candidate = candidates.get(item.candidateId)
  const parsed = parseCandidateId(item.candidateId)

  return {
    ...item,
    itemId: item.itemId ?? item.candidateId,
    title: candidate?.name ?? item.title,
    location: candidate?.address ?? item.location,
    latitude: candidate?.latitude ?? item.latitude,
    longitude: candidate?.longitude ?? item.longitude,
    sourceEntityType: parsed?.entityType,
    sourceEntityId: parsed?.id,
    category: candidate?.categories[0]?.replace(/_/g, ' '),
    area: candidate?.address,
    locked: item.locked ?? false,
    editorNotes: item.editorNotes ?? '',
    source: item.source ?? 'generated',
  }
}

export function attachCandidateMetadataToItinerary(
  itinerary: Itinerary,
  context: GeminiDestinationContext
): Itinerary {
  const candidates = new Map(context.candidates.map((candidate) => [candidate.id, candidate]))

  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      morning: day.morning.map((item) => attachItemMetadata(item, candidates)),
      afternoon: day.afternoon.map((item) => attachItemMetadata(item, candidates)),
      evening: day.evening.map((item) => attachItemMetadata(item, candidates)),
    })),
  }
}
