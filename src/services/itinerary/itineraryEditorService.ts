import type { Prisma } from '@prisma/client'
import { z } from 'zod'

import { GeminiProvider, GeminiProviderError } from '@/ai/providers/GeminiProvider'
import { prisma } from '@/db/client'
import { buildItineraryMapPoints } from '@/lib/maps/itineraryMapPoints'
import type { RequestTiming } from '@/lib/observability/requestTiming'
import type {
  ItineraryLockInput,
  ItineraryNotesInput,
  ItineraryRegenerateDayInput,
  ItineraryReorderInput,
  ItineraryReplaceInput,
} from '@/lib/validations/itineraryEditorValidation'
import {
  DestinationRetrievalService,
  resolveDestinationCity,
} from '@/services/destinations/destinationRetrievalService'
import type { RankedDestinationCandidate } from '@/services/destinations/types'
import {
  persistItineraryMutation,
  type PersistItineraryMutationInput,
  type PersistItineraryMutationResult,
} from '@/services/itinerary/itineraryRevisionPersistence'
import type {
  DayPlan,
  Itinerary,
  ItineraryEditorDocument,
  ItineraryItem,
  ItineraryPeriod,
  ItineraryReplacementOption,
  ItineraryRevisionAction,
} from '@/types/itinerary'

const CANDIDATE_ID = /^(ATTRACTION|RESTAURANT|HOTEL|ACTIVITY):([0-9a-f-]{36})$/i
const PERIODS: ItineraryPeriod[] = ['morning', 'afternoon', 'evening']
const MAX_REPLACEMENT_OPTIONS = 6

interface LoadedEditorTrip {
  id: string
  userId: string
  itineraryJson: unknown | null
  itineraryEditVersion: number
  preferenceSet: {
    destination: string | null
    travelStyles: string[]
    activityPreferences: string[]
    foodPreferences: string[]
  } | null
  travelProfile: { departureDate: Date | null } | null
}

interface DestinationImageData {
  url: string
  altText: string | null
  attribution: string | null
  licenseName: string | null
  licenseUrl: string | null
  sourceUrl: string | null
}

interface DayCandidatePlanItem {
  candidateId: string
  startTime: string
  durationMinutes: number
  reason: string
}

interface ItineraryEditorDependencies {
  loadTrip?: (tripId: string, userId: string) => Promise<LoadedEditorTrip | null>
  persistTrip?: (input: {
    tripId: PersistItineraryMutationInput['tripId']
    userId: PersistItineraryMutationInput['userId']
    expectedVersion: PersistItineraryMutationInput['expectedVersion']
    previousItinerary: PersistItineraryMutationInput['previousItinerary']
    nextItinerary: PersistItineraryMutationInput['nextItinerary']
    actionType: PersistItineraryMutationInput['actionType']
    actionSummary: PersistItineraryMutationInput['actionSummary']
    timing?: PersistItineraryMutationInput['timing']
  }) => Promise<PersistItineraryMutationResult | boolean>
  retrieveCandidates?: (trip: LoadedEditorTrip) => Promise<RankedDestinationCandidate[]>
  findActiveCandidateIds?: (candidateIds: string[]) => Promise<Set<string>>
  loadCandidateImages?: (
    candidateIds: string[]
  ) => Promise<Map<string, DestinationImageData>>
  generateDayPlan?: (input: {
    dayNumber: number
    allowedCandidates: RankedDestinationCandidate[]
    desiredTimes: string[]
  }) => Promise<DayCandidatePlanItem[]>
}

export class ItineraryEditorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ItineraryEditorError'
  }
}

const generatedDaySchema = z
  .object({
    items: z.array(
      z
        .object({
          candidateId: z.string().min(1),
          day: z.number().int().positive().optional(),
          startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          durationMinutes: z.number().int().min(15).max(720),
          reason: z.string().min(1).max(160),
        })
        .strict()
    ),
  })
  .strict()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseEditableItinerary(value: unknown): Itinerary {
  if (!isRecord(value) || !Array.isArray(value.days) || !Array.isArray(value.roadmap)) {
    throw new ItineraryEditorError(
      'ITINERARY_NOT_EDITABLE',
      'This itinerary must be regenerated before it can be edited.',
      409
    )
  }
  for (const day of value.days) {
    if (!isRecord(day) || typeof day.dayNumber !== 'number') {
      throw new ItineraryEditorError('ITINERARY_INVALID', 'Itinerary day data is invalid.', 422)
    }
    for (const period of PERIODS) {
      if (!Array.isArray(day[period])) {
        throw new ItineraryEditorError('ITINERARY_INVALID', 'Itinerary item data is invalid.', 422)
      }
      for (const item of day[period]) {
        if (!isRecord(item) || typeof item.candidateId !== 'string') {
          throw new ItineraryEditorError('ITINERARY_INVALID', 'Itinerary item data is invalid.', 422)
        }
      }
    }
  }
  return structuredClone(value) as unknown as Itinerary
}

function normalizeItem(item: ItineraryItem): ItineraryItem {
  return {
    ...item,
    itemId: item.itemId ?? item.candidateId,
    locked: item.locked === true,
    editorNotes: item.editorNotes ?? '',
    source: item.source ?? 'generated',
  }
}

export function normalizeEditableItinerary(itinerary: Itinerary): Itinerary {
  const normalized = {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      morning: day.morning.map(normalizeItem),
      afternoon: day.afternoon.map(normalizeItem),
      evening: day.evening.map(normalizeItem),
    })),
  }
  assertDocumentIntegrity(normalized)
  return normalized
}

function allItems(itinerary: Itinerary) {
  return itinerary.days.flatMap((day) =>
    PERIODS.flatMap((period) =>
      day[period].map((item, index) => ({ day, period, index, item }))
    )
  )
}

function assertDocumentIntegrity(itinerary: Itinerary): void {
  const itemIds = new Set<string>()
  const candidateIds = new Set<string>()
  for (const { item } of allItems(itinerary)) {
    const effectiveItemId = item.itemId ?? item.candidateId
    if (itemIds.has(effectiveItemId)) {
      throw new ItineraryEditorError('ITINERARY_INVALID', 'Itinerary item IDs are not unique.', 422)
    }
    if (!CANDIDATE_ID.test(item.candidateId) || candidateIds.has(item.candidateId)) {
      throw new ItineraryEditorError(
        'DESTINATION_CANDIDATE_CONTRACT_VIOLATION',
        'Itinerary destination IDs are invalid or duplicated.',
        422
      )
    }
    itemIds.add(effectiveItemId)
    candidateIds.add(item.candidateId)
  }
}

function findItem(itinerary: Itinerary, itemId: string) {
  const match = allItems(itinerary).find(
    ({ item }) => (item.itemId ?? item.candidateId) === itemId
  )
  if (!match) {
    throw new ItineraryEditorError('ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found.', 404)
  }
  return match
}

function recalculateItinerary(previous: Itinerary, next: Itinerary): Itinerary {
  const previousItemLocal = allItems(previous).reduce(
    (total, { item }) => total + item.estimatedCostLocal,
    0
  )
  const previousItemUser = allItems(previous).reduce(
    (total, { item }) => total + item.estimatedCostUserCurrency,
    0
  )
  const days = next.days.map((day) => {
    const items = PERIODS.flatMap((period) => day[period])
    return {
      ...day,
      dailyTotalLocal: items.reduce((total, item) => total + item.estimatedCostLocal, 0),
      dailyTotalUserCurrency: items.reduce(
        (total, item) => total + item.estimatedCostUserCurrency,
        0
      ),
    }
  })
  const nextItemLocal = days.reduce((total, day) => total + day.dailyTotalLocal, 0)
  const nextItemUser = days.reduce((total, day) => total + day.dailyTotalUserCurrency, 0)
  const fixedLocal = Math.max(0, previous.budget.estimatedTotalLocal - previousItemLocal)
  const fixedUser = Math.max(0, previous.budget.estimatedTotalUserCurrency - previousItemUser)
  const estimatedTotalLocal = fixedLocal + nextItemLocal
  const estimatedTotalUserCurrency = fixedUser + nextItemUser

  return {
    ...next,
    days,
    roadmap: days.map((day) => ({
      dayNumber: day.dayNumber,
      items: PERIODS.flatMap((period) =>
        day[period].map((item) => ({
          label: item.title,
          kind: roadmapKind(item),
          time: item.time,
        }))
      ),
    })),
    budget: {
      ...next.budget,
      estimatedTotalLocal,
      estimatedTotalUserCurrency,
      remainingBudgetUserCurrency:
        next.budget.totalBudgetUserCurrency - estimatedTotalUserCurrency,
      isBudgetExceeded: estimatedTotalUserCurrency > next.budget.totalBudgetUserCurrency,
    },
  }
}

function roadmapKind(item: ItineraryItem) {
  const type = item.sourceEntityType?.toLowerCase()
  if (type === 'attraction' || type === 'restaurant' || type === 'hotel' || type === 'activity') {
    return type
  }
  return 'other' as const
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dayDates(trip: LoadedEditorTrip, itinerary: Itinerary): Record<number, string> {
  const departureDate = trip.travelProfile?.departureDate
  if (!departureDate) return {}
  return Object.fromEntries(
    itinerary.days.map((day) => {
      const date = new Date(departureDate)
      date.setUTCDate(date.getUTCDate() + day.dayNumber - 1)
      return [day.dayNumber, dateOnly(date)]
    })
  )
}

function dayNotices(itinerary: Itinerary): Record<number, string[]> {
  const context = (itinerary as Itinerary & { itineraryTravelContext?: unknown })
    .itineraryTravelContext
  if (!isRecord(context)) return {}
  const notices: Record<number, string[]> = {}
  if (isRecord(context.arrivalTiming) && typeof context.arrivalTiming.usableDayStart === 'string') {
    notices[1] = [`Arrival-aware planning starts after ${context.arrivalTiming.usableDayStart}.`]
    const earliest = timeMinutes(context.arrivalTiming.usableDayStart)
    const firstDay = itinerary.days.find((day) => day.dayNumber === 1)
    if (earliest != null && firstDay) {
      const conflicts = PERIODS.flatMap((period) => firstDay[period]).filter(
        (item) => (timeMinutes(item.time) ?? earliest) < earliest
      )
      if (conflicts.length > 0) {
        notices[1].push(`${conflicts.length} item${conflicts.length === 1 ? '' : 's'} start before the arrival window.`)
      }
    }
  }
  if (isRecord(context.departureTiming) && typeof context.departureTiming.latestHotelDeparture === 'string') {
    const lastDay = itinerary.days.at(-1)?.dayNumber
    if (lastDay) {
      notices[lastDay] = [
        ...(notices[lastDay] ?? []),
        `Keep the final day clear after ${context.departureTiming.latestHotelDeparture}.`,
      ]
      const latest = timeMinutes(context.departureTiming.latestHotelDeparture)
      const finalDay = itinerary.days.find((day) => day.dayNumber === lastDay)
      if (latest != null && finalDay) {
        const conflicts = PERIODS.flatMap((period) => finalDay[period]).filter((item) => {
          const start = timeMinutes(item.time)
          return start != null && start + item.durationMinutes > latest
        })
        if (conflicts.length > 0) {
          notices[lastDay].push(`${conflicts.length} item${conflicts.length === 1 ? '' : 's'} extend beyond the departure window.`)
        }
      }
    }
  }
  return notices
}

function editorDocument(
  trip: LoadedEditorTrip,
  itinerary: Itinerary,
  version = trip.itineraryEditVersion
): ItineraryEditorDocument {
  const normalized = normalizeEditableItinerary(itinerary)
  return {
    itineraryId: trip.id,
    version,
    itinerary: normalized,
    mapPoints: buildItineraryMapPoints(normalized),
    dayDates: dayDates(trip, normalized),
    dayNotices: dayNotices(normalized),
  }
}

function candidateParts(candidateId: string) {
  const match = CANDIDATE_ID.exec(candidateId)
  return match ? { type: match[1].toUpperCase(), id: match[2] } : null
}

export async function findActiveItineraryCandidateIds(
  candidateIds: string[]
): Promise<Set<string>> {
  const grouped = new Map<string, string[]>()
  for (const candidateId of candidateIds) {
    const parsed = candidateParts(candidateId)
    if (!parsed) continue
    grouped.set(parsed.type, [...(grouped.get(parsed.type) ?? []), parsed.id])
  }
  const activeWhere = (ids: string[]) => ({
    id: { in: ids },
    deletedAt: null,
    city: { deletedAt: null, country: { deletedAt: null } },
  })
  const [attractions, restaurants, hotels, activities] = await Promise.all([
    prisma.attraction.findMany({ where: activeWhere(grouped.get('ATTRACTION') ?? []), select: { id: true } }),
    prisma.restaurant.findMany({ where: activeWhere(grouped.get('RESTAURANT') ?? []), select: { id: true } }),
    prisma.hotel.findMany({ where: activeWhere(grouped.get('HOTEL') ?? []), select: { id: true } }),
    prisma.activity.findMany({ where: activeWhere(grouped.get('ACTIVITY') ?? []), select: { id: true } }),
  ])
  return new Set([
    ...attractions.map(({ id }) => `ATTRACTION:${id}`),
    ...restaurants.map(({ id }) => `RESTAURANT:${id}`),
    ...hotels.map(({ id }) => `HOTEL:${id}`),
    ...activities.map(({ id }) => `ACTIVITY:${id}`),
  ])
}

async function defaultLoadCandidateImages(candidateIds: string[]) {
  const requested = new Set(candidateIds)
  const grouped = new Map<string, string[]>()
  for (const candidateId of candidateIds) {
    const parsed = candidateParts(candidateId)
    if (parsed) grouped.set(parsed.type, [...(grouped.get(parsed.type) ?? []), parsed.id])
  }
  const where: Prisma.DestinationImageWhereInput[] = []
  if (grouped.get('ATTRACTION')?.length) {
    where.push({ attractionId: { in: grouped.get('ATTRACTION') } })
  }
  if (grouped.get('RESTAURANT')?.length) {
    where.push({ restaurantId: { in: grouped.get('RESTAURANT') } })
  }
  if (grouped.get('HOTEL')?.length) where.push({ hotelId: { in: grouped.get('HOTEL') } })
  if (grouped.get('ACTIVITY')?.length) {
    where.push({ activityId: { in: grouped.get('ACTIVITY') } })
  }
  if (where.length === 0) return new Map<string, DestinationImageData>()
  const rows = await prisma.destinationImage.findMany({
    where: {
      deletedAt: null,
      OR: where,
    },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
  })
  const images = new Map<string, DestinationImageData>()
  for (const row of rows) {
    const candidateId = row.attractionId
      ? `ATTRACTION:${row.attractionId}`
      : row.restaurantId
        ? `RESTAURANT:${row.restaurantId}`
        : row.hotelId
          ? `HOTEL:${row.hotelId}`
          : row.activityId
            ? `ACTIVITY:${row.activityId}`
            : null
    if (candidateId && requested.has(candidateId) && !images.has(candidateId)) {
      images.set(candidateId, row)
    }
  }
  return images
}

async function defaultRetrieveCandidates(trip: LoadedEditorTrip) {
  const preferences = trip.preferenceSet
  if (!preferences?.destination) {
    throw new ItineraryEditorError(
      'DESTINATION_NOT_CONFIGURED',
      'Trip destination preferences are missing.',
      409
    )
  }
  const destination = preferences.destination
  const city = await resolveDestinationCity(destination)
  if (!city) {
    throw new ItineraryEditorError(
      'DESTINATION_CITY_NOT_FOUND',
      'Destination city is not available.',
      400
    )
  }
  const result = await new DestinationRetrievalService().retrieve({
    cityId: city.id,
    travelStyles: preferences.travelStyles,
    interests: [...preferences.activityPreferences, ...preferences.foodPreferences],
    limitPerType: 12,
  })
  return result.candidates
}

async function defaultGenerateDayPlan(input: {
  dayNumber: number
  allowedCandidates: RankedDestinationCandidate[]
  desiredTimes: string[]
}): Promise<DayCandidatePlanItem[]> {
  const prompt = [
    'Rebuild one itinerary day using only the supplied destination candidates.',
    `Day number: ${input.dayNumber}`,
    `Desired start times: ${input.desiredTimes.join(', ')}`,
    `Return JSON only: {"items":[{"candidateId":"exact supplied ID","day":${input.dayNumber},"startTime":"HH:mm","durationMinutes":90,"reason":"short reason"}]}`,
    'Do not repeat IDs. Do not invent IDs, places, prices, names, or coordinates.',
    JSON.stringify(
      input.allowedCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        category: candidate.entityType,
        area: candidate.address ?? candidate.cityName,
        durationMinutes: candidate.durationMinutes,
        openingHours: candidate.openingHours,
      }))
    ),
  ].join('\n')
  const raw = await new GeminiProvider().generateJson(prompt)
  return generatedDaySchema.parse(JSON.parse(raw)).items
}

function optionReason(candidate: RankedDestinationCandidate, current: ItineraryItem): string {
  const sameCategory = candidate.entityType === current.sourceEntityType
  const area = candidate.address ?? candidate.cityName
  return sameCategory
    ? `A similar ${candidate.entityType.toLowerCase()} in ${area}.`
    : `A well-ranked alternative in ${area} that adds variety.`
}

function timeMinutes(value: string): number | null {
  const match = /(?:T)?([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function candidateOpenScore(
  candidate: RankedDestinationCandidate,
  dayNumber: number,
  time: string,
  trip: LoadedEditorTrip
): number {
  const departure = trip.travelProfile?.departureDate
  if (!departure || candidate.openingHours.length === 0) return 0
  const date = new Date(departure)
  date.setUTCDate(date.getUTCDate() + dayNumber - 1)
  const hours = candidate.openingHours.find((entry) => entry.dayOfWeek === date.getUTCDay())
  if (!hours) return 0
  if (hours.isClosed) return -30
  const start = timeMinutes(time)
  const opens = hours.opensAt ? timeMinutes(hours.opensAt) : null
  const closes = hours.closesAt ? timeMinutes(hours.closesAt) : null
  if (start == null || opens == null || closes == null) return 0
  return start >= opens && start + (candidate.durationMinutes ?? 60) <= closes ? 15 : -15
}

function replacementCandidates(input: {
  candidates: RankedDestinationCandidate[]
  used: Set<string>
  current: ItineraryItem
  dayNumber: number
  trip: LoadedEditorTrip
}) {
  return input.candidates
    .filter((candidate) => !input.used.has(candidate.candidateId))
    .sort((first, second) => {
      const score = (candidate: RankedDestinationCandidate) =>
        (candidate.entityType === input.current.sourceEntityType ? 30 : 0) +
        (candidate.address && candidate.address === input.current.area ? 12 : 0) +
        candidateOpenScore(candidate, input.dayNumber, input.current.time, input.trip) +
        candidate.rankScore
      return score(second) - score(first) || first.name.localeCompare(second.name)
    })
    .slice(0, MAX_REPLACEMENT_OPTIONS)
}

function imageData(image: DestinationImageData | undefined): ItineraryItem['image'] | undefined {
  if (!image) return undefined
  return {
    url: image.url,
    altText: image.altText ?? undefined,
    attribution: image.attribution ?? undefined,
    licenseName: image.licenseName ?? undefined,
    licenseUrl: image.licenseUrl ?? undefined,
    sourceUrl: image.sourceUrl ?? undefined,
  }
}

function categoryLabel(candidate: RankedDestinationCandidate): string {
  return candidate.categories[0]?.replace(/_/g, ' ') ?? candidate.entityType.toLowerCase()
}

function priceForCandidate(candidate: RankedDestinationCandidate, itinerary: Itinerary) {
  const ticket = candidate.ticketPrices.find(
    (price) => price.amount != null || price.minAmount != null
  )
  const local = ticket?.amount ?? ticket?.minAmount
  if (local == null) {
    return {
      estimatedCostLocal: 0,
      estimatedCostUserCurrency: 0,
      currencyLocal: itinerary.currencyLocal,
      currencyUser: itinerary.currencyUser,
      priceConfidence: 'PRICE_UNKNOWN' as const,
    }
  }
  return {
    estimatedCostLocal: local,
    estimatedCostUserCurrency: Number((local * itinerary.exchangeRate.rate).toFixed(2)),
    currencyLocal: ticket?.currency ?? itinerary.currencyLocal,
    currencyUser: itinerary.currencyUser,
    priceConfidence: candidate.priceConfidence,
  }
}

function itemFromCandidate(input: {
  candidate: RankedDestinationCandidate
  previous: ItineraryItem
  itinerary: Itinerary
  source: 'manual' | 'generated' | 'fallback'
  reason: string
  time?: string
  durationMinutes?: number
  image?: DestinationImageData
}): ItineraryItem {
  const { candidate, previous, itinerary } = input
  const durationMinutes = input.durationMinutes ?? candidate.durationMinutes ?? previous.durationMinutes
  return {
    ...previous,
    candidateId: candidate.candidateId,
    time: input.time ?? previous.time,
    title: candidate.name,
    description: candidate.description ?? '',
    location: candidate.address ?? candidate.cityName,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    estimatedDuration: `${durationMinutes} min`,
    durationMinutes,
    reason: input.reason,
    ...priceForCandidate(candidate, itinerary),
    sourceEntityType: candidate.entityType,
    sourceEntityId: candidate.id,
    category: categoryLabel(candidate),
    area: candidate.address ?? candidate.cityName,
    source: input.source,
    replacedFromCandidateId:
      input.source === 'manual' ? previous.candidateId : previous.replacedFromCandidateId,
    image: imageData(input.image),
    tips: [],
  }
}

function periodForTime(time: string): ItineraryPeriod {
  const hour = Number(time.slice(0, 2))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

function deterministicDayPlan(input: {
  day: DayPlan
  candidates: RankedDestinationCandidate[]
  itinerary: Itinerary
}): DayCandidatePlanItem[] {
  const unlocked = PERIODS.flatMap((period) => input.day[period]).filter((item) => !item.locked)
  const window = planningWindow(input.itinerary, input.day.dayNumber)
  let nextStart = window.earliest
  return unlocked.slice(0, input.candidates.length).flatMap((item, index) => {
    const durationMinutes = input.candidates[index].durationMinutes ?? item.durationMinutes
    const preferred = timeMinutes(item.time) ?? nextStart ?? 9 * 60
    const start = Math.max(preferred, nextStart ?? preferred)
    if (window.latest != null && start + durationMinutes > window.latest) return []
    nextStart = start + durationMinutes + 30
    return [{
      candidateId: input.candidates[index].candidateId,
      startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      durationMinutes,
      reason: 'Deterministic replacement selected from the highest-ranked unused candidates.',
    }]
  })
}

function planningWindow(itinerary: Itinerary, dayNumber: number) {
  const context = (itinerary as Itinerary & { itineraryTravelContext?: unknown })
    .itineraryTravelContext
  if (!isRecord(context)) return { earliest: null, latest: null }
  const earliest =
    dayNumber === 1 && isRecord(context.arrivalTiming) &&
    typeof context.arrivalTiming.usableDayStart === 'string'
      ? timeMinutes(context.arrivalTiming.usableDayStart)
      : null
  const finalDay = itinerary.days.at(-1)?.dayNumber
  const latest =
    dayNumber === finalDay && isRecord(context.departureTiming) &&
    typeof context.departureTiming.latestHotelDeparture === 'string'
      ? timeMinutes(context.departureTiming.latestHotelDeparture)
      : null
  return { earliest, latest }
}

export type RegenerateDayResult =
  | { state: 'applied'; document: ItineraryEditorDocument }
  | {
      state: 'fallback_ready'
      version: number
      day: DayPlan
      errorCode: string
    }

export class ItineraryEditorService {
  private readonly dependencies: Required<ItineraryEditorDependencies>

  constructor(dependencies: ItineraryEditorDependencies = {}) {
    this.dependencies = {
      loadTrip:
        dependencies.loadTrip ??
        ((tripId, userId) =>
          prisma.trip.findFirst({
            where: { id: tripId, userId },
            include: { preferenceSet: true, travelProfile: true },
          })),
      persistTrip: dependencies.persistTrip ?? persistItineraryMutation,
      retrieveCandidates: dependencies.retrieveCandidates ?? defaultRetrieveCandidates,
      findActiveCandidateIds:
        dependencies.findActiveCandidateIds ?? findActiveItineraryCandidateIds,
      loadCandidateImages: dependencies.loadCandidateImages ?? defaultLoadCandidateImages,
      generateDayPlan: dependencies.generateDayPlan ?? defaultGenerateDayPlan,
    }
  }

  async get(tripId: string, userId: string): Promise<ItineraryEditorDocument> {
    const trip = await this.requireTrip(tripId, userId)
    return editorDocument(trip, parseEditableItinerary(trip.itineraryJson))
  }

  async reorder(
    tripId: string,
    userId: string,
    input: ItineraryReorderInput,
    timing?: RequestTiming
  ) {
    return this.mutate(tripId, userId, input.expectedVersion, (itinerary) => {
      const source = findItem(itinerary, input.itemId)
      const targetDay = itinerary.days.find((day) => day.dayNumber === input.targetDayNumber)
      if (!targetDay) throw new ItineraryEditorError('ITINERARY_DAY_NOT_FOUND', 'Day not found.', 404)
      const sourceDayNumber = source.day.dayNumber
      const title = source.item.title
      source.day[source.period].splice(source.index, 1)
      const target = targetDay[input.targetPeriod]
      target.splice(Math.min(input.targetIndex, target.length), 0, source.item)
      return {
        itinerary,
        actionType: sourceDayNumber === targetDay.dayNumber ? 'reorder_item' : 'move_item',
        actionSummary:
          sourceDayNumber === targetDay.dayNumber
            ? `Reordered ${title} on Day ${sourceDayNumber}`
            : `Moved ${title} from Day ${sourceDayNumber} to Day ${targetDay.dayNumber}`,
      }
    }, timing)
  }

  async setLock(
    tripId: string,
    userId: string,
    input: ItineraryLockInput,
    timing?: RequestTiming
  ) {
    return this.mutate(tripId, userId, input.expectedVersion, (itinerary) => {
      const item = findItem(itinerary, input.itemId).item
      item.locked = input.locked
      return {
        itinerary,
        actionType: input.locked ? 'lock_item' : 'unlock_item',
        actionSummary: `${input.locked ? 'Locked' : 'Unlocked'} ${item.title}`,
      }
    }, timing)
  }

  async setNotes(
    tripId: string,
    userId: string,
    input: ItineraryNotesInput,
    timing?: RequestTiming
  ) {
    return this.mutate(tripId, userId, input.expectedVersion, (itinerary) => {
      const item = findItem(itinerary, input.itemId).item
      item.editorNotes = input.notes
      return {
        itinerary,
        actionType: 'update_notes',
        actionSummary: `Updated notes for ${item.title}`,
      }
    }, timing)
  }

  async replacementOptions(
    tripId: string,
    userId: string,
    itemId: string,
    timing?: RequestTiming
  ): Promise<ItineraryReplacementOption[]> {
    const trip = await this.requireTrip(tripId, userId)
    const itinerary = parseEditableItinerary(trip.itineraryJson)
    const match = findItem(itinerary, itemId)
    const current = match.item
    const candidates = await this.retrieve(trip, timing)
    const used = new Set(allItems(itinerary).map(({ item }) => item.candidateId))
    const alternatives = replacementCandidates({
      candidates,
      used,
      current,
      dayNumber: match.day.dayNumber,
      trip,
    })
    const images = await this.dependencies.loadCandidateImages(
      alternatives.map((candidate) => candidate.candidateId)
    )
    return alternatives.map((candidate) => ({
      candidateId: candidate.candidateId,
      name: candidate.name,
      category: categoryLabel(candidate),
      area: candidate.address ?? candidate.cityName,
      reason: optionReason(candidate, current),
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      image: imageData(images.get(candidate.candidateId)),
    }))
  }

  async replace(
    tripId: string,
    userId: string,
    input: ItineraryReplaceInput,
    timing?: RequestTiming
  ) {
    const trip = await this.requireTrip(tripId, userId)
    this.assertVersion(trip, input.expectedVersion)
    const itinerary = parseEditableItinerary(trip.itineraryJson)
    const previous = structuredClone(itinerary)
    const match = findItem(itinerary, input.itemId)
    const candidates = await this.retrieve(trip, timing)
    const used = new Set(allItems(itinerary).map(({ item }) => item.candidateId))
    const allowed = replacementCandidates({
      candidates,
      used,
      current: match.item,
      dayNumber: match.day.dayNumber,
      trip,
    })
    const selected = allowed.find((candidate) => candidate.candidateId === input.candidateId)
    if (!selected) {
      throw new ItineraryEditorError(
        'DESTINATION_CANDIDATE_NOT_ALLOWED',
        'The selected replacement is not in the current allowed candidate set.',
        422
      )
    }
    const images = await this.dependencies.loadCandidateImages([selected.candidateId])
    match.day[match.period][match.index] = itemFromCandidate({
      candidate: selected,
      previous: match.item,
      itinerary,
      source: 'manual',
      reason: optionReason(selected, match.item),
      image: images.get(selected.candidateId),
    })
    return this.persist(
      trip,
      previous,
      itinerary,
      'replace_item',
      `Replaced ${match.item.title} with ${selected.name}`,
      timing
    )
  }

  async regenerateDay(
    tripId: string,
    userId: string,
    input: ItineraryRegenerateDayInput,
    timing?: RequestTiming
  ): Promise<RegenerateDayResult> {
    const trip = await this.requireTrip(tripId, userId)
    this.assertVersion(trip, input.expectedVersion)
    const itinerary = parseEditableItinerary(trip.itineraryJson)
    const previous = structuredClone(itinerary)
    const day = itinerary.days.find((candidate) => candidate.dayNumber === input.dayNumber)
    if (!day) throw new ItineraryEditorError('ITINERARY_DAY_NOT_FOUND', 'Day not found.', 404)
    const usedOutsideDay = new Set(
      allItems(itinerary)
        .filter(({ day: itemDay }) => itemDay.dayNumber !== day.dayNumber)
        .map(({ item }) => item.candidateId)
    )
    const lockedIds = new Set(
      PERIODS.flatMap((period) => day[period])
        .filter((item) => item.locked)
        .map((item) => item.candidateId)
    )
    const candidates = (await this.retrieve(trip, timing)).filter(
      (candidate) => !usedOutsideDay.has(candidate.candidateId) && !lockedIds.has(candidate.candidateId)
    )
    const desiredTimes = PERIODS.flatMap((period) => day[period])
      .filter((item) => !item.locked)
      .map((item) => item.time)
    if (desiredTimes.length === 0) {
      return { state: 'applied', document: editorDocument(trip, itinerary) }
    }

    let plan: DayCandidatePlanItem[]
    let source: 'generated' | 'fallback' = 'generated'
    if (input.acceptFallback) {
      plan = deterministicDayPlan({ day, candidates, itinerary })
      source = 'fallback'
    } else {
      try {
        const generate = () =>
          this.dependencies.generateDayPlan({ dayNumber: day.dayNumber, allowedCandidates: candidates, desiredTimes })
        plan = timing ? await timing.measure('gemini_invocation', generate) : await generate()
        this.validateGeneratedPlan(
          plan,
          candidates,
          usedOutsideDay,
          desiredTimes.length,
          itinerary,
          day.dayNumber
        )
      } catch (error) {
        const fallbackPlan = deterministicDayPlan({ day, candidates, itinerary })
        this.validateGeneratedPlan(
          fallbackPlan,
          candidates,
          usedOutsideDay,
          desiredTimes.length,
          itinerary,
          day.dayNumber
        )
        const proposal = this.applyDayPlan(itinerary, day, fallbackPlan, candidates, 'fallback')
        return {
          state: 'fallback_ready',
          version: trip.itineraryEditVersion,
          day: proposal.days.find((candidate) => candidate.dayNumber === day.dayNumber)!,
          errorCode: error instanceof GeminiProviderError ? error.code : 'DAY_REGENERATION_FAILED',
        }
      }
    }
    this.validateGeneratedPlan(
      plan,
      candidates,
      usedOutsideDay,
      desiredTimes.length,
      itinerary,
      day.dayNumber
    )
    const next = this.applyDayPlan(itinerary, day, plan, candidates, source)
    return {
      state: 'applied',
      document: await this.persist(
        trip,
        previous,
        next,
        source === 'fallback' ? 'apply_fallback_day' : 'regenerate_day',
        source === 'fallback'
          ? `Applied fallback plan to Day ${day.dayNumber}`
          : `Regenerated Day ${day.dayNumber}`,
        timing
      ),
    }
  }

  private applyDayPlan(
    itinerary: Itinerary,
    day: DayPlan,
    plan: DayCandidatePlanItem[],
    candidates: RankedDestinationCandidate[],
    source: 'generated' | 'fallback'
  ): Itinerary {
    const next = structuredClone(itinerary)
    const nextDay = next.days.find((candidate) => candidate.dayNumber === day.dayNumber)!
    const previousUnlocked = PERIODS.flatMap((period) => day[period]).filter((item) => !item.locked)
    for (const period of PERIODS) nextDay[period] = nextDay[period].filter((item) => item.locked)
    const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]))
    plan.forEach((planned, index) => {
      const candidate = candidatesById.get(planned.candidateId)!
      const previous = previousUnlocked[Math.min(index, previousUnlocked.length - 1)]
      if (!previous) return
      const item = itemFromCandidate({
        candidate,
        previous,
        itinerary,
        source,
        reason: planned.reason,
        time: planned.startTime,
        durationMinutes: planned.durationMinutes,
      })
      nextDay[periodForTime(item.time)].push(item)
    })
    for (const period of PERIODS) nextDay[period].sort((first, second) => first.time.localeCompare(second.time))
    return next
  }

  private validateGeneratedPlan(
    plan: DayCandidatePlanItem[],
    candidates: RankedDestinationCandidate[],
    usedOutsideDay: Set<string>,
    maximumItems: number,
    itinerary: Itinerary,
    dayNumber: number
  ) {
    if (plan.length > maximumItems) {
      throw new ItineraryEditorError(
        'DAY_REGENERATION_ITEM_LIMIT',
        'Day regeneration returned too many itinerary items.',
        422
      )
    }
    const allowed = new Set(candidates.map((candidate) => candidate.candidateId))
    const seen = new Set<string>()
    for (const item of plan) {
      if (!allowed.has(item.candidateId) || usedOutsideDay.has(item.candidateId) || seen.has(item.candidateId)) {
        throw new ItineraryEditorError(
          'DESTINATION_CANDIDATE_CONTRACT_VIOLATION',
          'Day regeneration returned an unsupported or duplicated destination ID.',
          422
        )
      }
      seen.add(item.candidateId)
      this.assertTimingWindow(itinerary, dayNumber, item)
    }
  }

  private assertTimingWindow(
    itinerary: Itinerary,
    dayNumber: number,
    item: DayCandidatePlanItem
  ) {
    const window = planningWindow(itinerary, dayNumber)
    const start = timeMinutes(item.startTime)
    if (start == null) return
    if (window.earliest != null && start < window.earliest) {
        throw new ItineraryEditorError(
          'DAY_REGENERATION_TIMING_CONFLICT',
          'Regenerated day starts before the arrival planning window.',
          422
        )
    }
    if (window.latest != null && start + item.durationMinutes > window.latest) {
        throw new ItineraryEditorError(
          'DAY_REGENERATION_TIMING_CONFLICT',
          'Regenerated day extends beyond the departure planning window.',
          422
        )
    }
  }

  private async mutate(
    tripId: string,
    userId: string,
    expectedVersion: number,
    transform: (itinerary: Itinerary) => {
      itinerary: Itinerary
      actionType: ItineraryRevisionAction
      actionSummary: string
    },
    timing?: RequestTiming
  ) {
    const trip = await this.requireTrip(tripId, userId)
    this.assertVersion(trip, expectedVersion)
    const previous = parseEditableItinerary(trip.itineraryJson)
    const mutation = transform(structuredClone(previous))
    assertDocumentIntegrity(mutation.itinerary)
    return this.persist(
      trip,
      previous,
      recalculateItinerary(previous, mutation.itinerary),
      mutation.actionType,
      mutation.actionSummary,
      timing
    )
  }

  private async persist(
    trip: LoadedEditorTrip,
    previousItinerary: Itinerary,
    itinerary: Itinerary,
    actionType: ItineraryRevisionAction,
    actionSummary: string,
    timing?: RequestTiming
  ) {
    assertDocumentIntegrity(itinerary)
    const candidateIds = allItems(itinerary).map(({ item }) => item.candidateId)
    const active = await this.dependencies.findActiveCandidateIds(candidateIds)
    const inactive = candidateIds.filter((candidateId) => !active.has(candidateId))
    if (inactive.length > 0) {
      throw new ItineraryEditorError(
        'DESTINATION_CANDIDATE_NOT_ACTIVE',
        'The itinerary contains destination records that are no longer active.',
        422,
        { count: inactive.length }
      )
    }
    const persistence = await this.dependencies.persistTrip({
      tripId: trip.id,
      userId: trip.userId,
      expectedVersion: trip.itineraryEditVersion,
      previousItinerary,
      nextItinerary: itinerary,
      actionType,
      actionSummary,
      timing,
    })
    const updated = typeof persistence === 'boolean' ? persistence : persistence.updated
    if (typeof persistence !== 'boolean') timing?.setResultCount(persistence.revisionCount)
    if (!updated) {
      throw new ItineraryEditorError(
        'ITINERARY_VERSION_CONFLICT',
        'This itinerary changed in another session. Reload before saving again.',
        409
      )
    }
    return editorDocument(trip, itinerary, trip.itineraryEditVersion + 1)
  }

  private async retrieve(trip: LoadedEditorTrip, timing?: RequestTiming) {
    const work = () => this.dependencies.retrieveCandidates(trip)
    return timing ? timing.measure('destination_retrieval', work) : work()
  }

  private assertVersion(trip: LoadedEditorTrip, expectedVersion: number) {
    if (trip.itineraryEditVersion !== expectedVersion) {
      throw new ItineraryEditorError(
        'ITINERARY_VERSION_CONFLICT',
        'This itinerary changed in another session. Reload before saving again.',
        409
      )
    }
  }

  private async requireTrip(tripId: string, userId: string) {
    const trip = await this.dependencies.loadTrip(tripId, userId)
    if (!trip) throw new ItineraryEditorError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    if (!trip.itineraryJson) {
      throw new ItineraryEditorError('ITINERARY_NOT_FOUND', 'Generate an itinerary first.', 404)
    }
    return trip
  }
}
