import type { Itinerary, ItineraryMapPoint, ItineraryPeriod } from '@/types/itinerary'

const CANDIDATE_ID = /^(ATTRACTION|RESTAURANT|HOTEL|ACTIVITY):([0-9a-f-]{36})$/i
const PERIODS: ItineraryPeriod[] = ['morning', 'afternoon', 'evening']

export type ItineraryMapPointSkipReason =
  | 'invalid_candidate_id'
  | 'invalid_coordinate'
  | 'invalid_day'
  | 'invalid_order'
  | 'missing_item_id'
  | 'duplicate_item_id'

export interface ItineraryMapPointValidation {
  validPoints: ItineraryMapPoint[]
  skippedPointCount: number
  skippedByReason: Partial<Record<ItineraryMapPointSkipReason, number>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function areaGroups(itinerary: Itinerary): Map<string, string> {
  const groups = new Map<string, string>()
  const context = (itinerary as Itinerary & { itineraryTravelContext?: unknown })
    .itineraryTravelContext
  if (!isRecord(context) || !isRecord(context.planningPreview)) return groups
  const recommendations = context.planningPreview.rankedRecommendations
  if (!Array.isArray(recommendations)) return groups
  for (const recommendation of recommendations) {
    if (
      isRecord(recommendation) &&
      typeof recommendation.candidateId === 'string' &&
      typeof recommendation.areaGroup === 'string'
    ) {
      groups.set(recommendation.candidateId, recommendation.areaGroup)
    }
  }
  return groups
}

export function buildItineraryMapPoints(itinerary: Itinerary): ItineraryMapPoint[] {
  const groups = areaGroups(itinerary)
  let orderIndex = 0
  return itinerary.days.flatMap((day) =>
    PERIODS.flatMap((period) =>
      day[period].flatMap((item) => {
        if (item.latitude == null || item.longitude == null) return []
        const point: ItineraryMapPoint = {
          itemId: item.itemId ?? item.candidateId,
          candidateId: item.candidateId,
          dayNumber: day.dayNumber,
          orderIndex,
          title: item.title,
          latitude: item.latitude,
          longitude: item.longitude,
          category: item.category ?? item.sourceEntityType?.toLowerCase() ?? 'other',
          areaGroup: item.areaGroup ?? groups.get(item.candidateId) ?? null,
        }
        orderIndex += 1
        return [point]
      })
    )
  )
}

export function validateItineraryMapPoints(
  points: ItineraryMapPoint[]
): ItineraryMapPointValidation {
  const seenItemIds = new Set<string>()
  const skippedByReason: Partial<Record<ItineraryMapPointSkipReason, number>> = {}
  const validPoints: ItineraryMapPoint[] = []
  const skip = (reason: ItineraryMapPointSkipReason) => {
    skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1
  }

  for (const point of points) {
    if (!point.itemId) {
      skip('missing_item_id')
      continue
    }
    if (seenItemIds.has(point.itemId)) {
      skip('duplicate_item_id')
      continue
    }
    if (!CANDIDATE_ID.test(point.candidateId)) {
      skip('invalid_candidate_id')
      continue
    }
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      skip('invalid_coordinate')
      continue
    }
    if (!Number.isInteger(point.dayNumber) || point.dayNumber < 1) {
      skip('invalid_day')
      continue
    }
    if (!Number.isInteger(point.orderIndex) || point.orderIndex < 0) {
      skip('invalid_order')
      continue
    }
    seenItemIds.add(point.itemId)
    validPoints.push(point)
  }

  validPoints.sort(
    (first, second) =>
      first.dayNumber - second.dayNumber || first.orderIndex - second.orderIndex
  )
  return {
    validPoints,
    skippedPointCount: points.length - validPoints.length,
    skippedByReason,
  }
}

export function groupItineraryMapPointsByDay(points: ItineraryMapPoint[]) {
  const grouped = new Map<number, ItineraryMapPoint[]>()
  for (const point of points) {
    grouped.set(point.dayNumber, [...(grouped.get(point.dayNumber) ?? []), point])
  }
  return [...grouped.entries()]
    .sort(([first], [second]) => first - second)
    .map(([dayNumber, dayPoints]) => ({
      dayNumber,
      points: dayPoints.sort((first, second) => first.orderIndex - second.orderIndex),
    }))
}
