import type {
  FlightSelectionStrategy,
  HotelSelectionStrategy,
  TravelCabinClass,
  TripBudgetSnapshotStatus,
  TripOfferSelectionStatus,
  TripTravelProfile,
} from '@prisma/client'

import { prisma } from '@/db/client'
import type { TripTravelProfileUpdateInput } from '@/lib/validations/travelOfferValidation'
import { getProfileSummary } from '@/services/profileService'

export type PlanningStatus =
  | 'DRAFT'
  | 'READY_FOR_SEARCH'
  | 'OFFERS_SELECTED'
  | 'COMPLETE'
  | 'ACTION_REQUIRED'

export interface TripTravelProfileResponse {
  id: string
  tripId: string
  originCity?: string
  originCountry?: string
  originAirportCode?: string
  destinationAirportCode?: string
  departureDate?: string
  returnDate?: string
  adults: number
  children: number
  infants: number
  rooms: number
  cabinClass: TravelCabinClass
  nonStopOnly: boolean
  currency?: string
  currencySource: 'PERSISTED' | 'PROFILE' | 'MISSING'
  flightSelectionStrategy: FlightSelectionStrategy
  hotelSelectionStrategy: HotelSelectionStrategy
  createdAt: string
  updatedAt: string
}

export interface PlanningReadiness {
  planningStatus: PlanningStatus
  missingRequiredFields: string[]
  canSearchOffers: boolean
  canSelectOffers: boolean
  canGenerateItinerary: boolean
}

interface ProfileCurrencyDependency {
  getPreferredCurrency(userId: string): Promise<string | null>
}

interface TripTravelProfileDependencies extends Partial<ProfileCurrencyDependency> {
  db?: typeof prisma
  now?: () => Date
}

interface NormalizedTripTravelProfileInput {
  originCity?: string
  originCountry?: string
  originAirportCode?: string
  destinationAirportCode?: string
  departureDate?: Date
  returnDate?: Date
  adults?: number
  children?: number
  infants?: number
  rooms?: number
  cabinClass?: TravelCabinClass
  nonStopOnly?: boolean
  currency?: string
  flightSelectionStrategy?: FlightSelectionStrategy
  hotelSelectionStrategy?: HotelSelectionStrategy
}

type SearchCriticalField =
  | 'originAirportCode'
  | 'destinationAirportCode'
  | 'departureDate'
  | 'returnDate'
  | 'adults'
  | 'children'
  | 'infants'
  | 'rooms'
  | 'cabinClass'
  | 'nonStopOnly'
  | 'currency'

const FLIGHT_CRITICAL_FIELDS: SearchCriticalField[] = [
  'originAirportCode',
  'destinationAirportCode',
  'departureDate',
  'returnDate',
  'adults',
  'children',
  'infants',
  'cabinClass',
  'nonStopOnly',
  'currency',
]

const HOTEL_CRITICAL_FIELDS: SearchCriticalField[] = [
  'destinationAirportCode',
  'departureDate',
  'returnDate',
  'adults',
  'children',
  'rooms',
  'currency',
]

export class TripTravelProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TripTravelProfileError'
  }
}

async function defaultGetPreferredCurrency(userId: string): Promise<string | null> {
  return (await getProfileSummary(userId)).profile.preferredCurrency
}

export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function dateToDateOnly(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().slice(0, 10)
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeInput(input: TripTravelProfileUpdateInput): NormalizedTripTravelProfileInput {
  const normalized: NormalizedTripTravelProfileInput = {}
  const assignDefined = <Key extends keyof NormalizedTripTravelProfileInput>(
    key: Key,
    value: NormalizedTripTravelProfileInput[Key] | undefined
  ) => {
    if (value !== undefined) normalized[key] = value
  }

  assignDefined('originCity', normalizeText(input.originCity))
  assignDefined('originCountry', normalizeText(input.originCountry))
  assignDefined('originAirportCode', input.originAirportCode)
  assignDefined('destinationAirportCode', input.destinationAirportCode)
  assignDefined('departureDate', input.departureDate ? dateOnlyToDate(input.departureDate) : undefined)
  assignDefined('returnDate', input.returnDate ? dateOnlyToDate(input.returnDate) : undefined)
  assignDefined('adults', input.adults)
  assignDefined('children', input.children)
  assignDefined('infants', input.infants)
  assignDefined('rooms', input.rooms)
  assignDefined('cabinClass', input.cabinClass as TravelCabinClass | undefined)
  assignDefined('nonStopOnly', input.nonStopOnly)
  assignDefined('currency', input.currency)
  assignDefined('flightSelectionStrategy', input.flightSelectionStrategy as FlightSelectionStrategy | undefined)
  assignDefined('hotelSelectionStrategy', input.hotelSelectionStrategy as HotelSelectionStrategy | undefined)

  return normalized
}

function completeProfileDraft(
  existing: TripTravelProfile | null,
  input: NormalizedTripTravelProfileInput
) {
  return {
    originAirportCode: input.originAirportCode ?? existing?.originAirportCode ?? undefined,
    destinationAirportCode: input.destinationAirportCode ?? existing?.destinationAirportCode ?? undefined,
    departureDate: input.departureDate ?? existing?.departureDate ?? undefined,
    returnDate: input.returnDate ?? existing?.returnDate ?? undefined,
    adults: input.adults ?? existing?.adults ?? 1,
    children: input.children ?? existing?.children ?? 0,
    infants: input.infants ?? existing?.infants ?? 0,
    rooms: input.rooms ?? existing?.rooms ?? 1,
    cabinClass: input.cabinClass ?? existing?.cabinClass ?? 'ECONOMY',
    nonStopOnly: input.nonStopOnly ?? existing?.nonStopOnly ?? false,
    currency: input.currency ?? existing?.currency ?? undefined,
  }
}

function validateMergedProfile(profile: ReturnType<typeof completeProfileDraft>) {
  const issues: string[] = []
  const travelerCount = profile.adults + profile.children + profile.infants
  if (profile.adults < 1) issues.push('adults must be at least 1')
  if (profile.children < 0) issues.push('children must be non-negative')
  if (profile.infants < 0) issues.push('infants must be non-negative')
  if (profile.infants > profile.adults) issues.push('infants cannot exceed adults')
  if (profile.rooms < 1) issues.push('rooms must be at least 1')
  if (profile.rooms > travelerCount && process.env.ALLOW_ROOMS_GREATER_THAN_TRAVELERS !== 'true') {
    issues.push('rooms cannot exceed total travelers')
  }
  const maxTravelers = Number(process.env.MAX_TRAVELERS_PER_TRIP ?? 18)
  if (Number.isInteger(maxTravelers) && travelerCount > maxTravelers) {
    issues.push(`total travelers cannot exceed ${maxTravelers}`)
  }
  if (profile.departureDate && profile.returnDate && profile.returnDate <= profile.departureDate) {
    issues.push('return date must be after departure date')
  }

  if (issues.length > 0) {
    throw new TripTravelProfileError(
      'INVALID_TRAVEL_PROFILE',
      'Travel profile is invalid.',
      400,
      { issues }
    )
  }
}

function dateEqual(first: Date | null | undefined, second: Date | null | undefined): boolean {
  return dateToDateOnly(first) === dateToDateOnly(second)
}

function changedFields(existing: TripTravelProfile | null, input: NormalizedTripTravelProfileInput): Set<SearchCriticalField> {
  const changed = new Set<SearchCriticalField>()
  if (!existing) return changed

  for (const field of [...FLIGHT_CRITICAL_FIELDS, ...HOTEL_CRITICAL_FIELDS]) {
    if (!(field in input)) continue
    const next = input[field]
    const current = existing[field]
    const isDateField = field === 'departureDate' || field === 'returnDate'
    const isChanged = isDateField ? !dateEqual(current as Date | null, next as Date | undefined) : current !== next
    if (isChanged) changed.add(field)
  }

  return changed
}

function hasAny(fields: Set<SearchCriticalField>, candidates: SearchCriticalField[]): boolean {
  return candidates.some((field) => fields.has(field))
}

function readiness(
  profile: TripTravelProfile | null,
  currency: string | null,
  hasFlightSelection: boolean,
  hasHotelSelection: boolean,
  hasCompleteItinerary: boolean
): PlanningReadiness {
  const missingRequiredFields: string[] = []
  if (!profile?.originAirportCode) missingRequiredFields.push('originAirportCode')
  if (!profile?.destinationAirportCode) missingRequiredFields.push('destinationAirportCode')
  if (!profile?.departureDate) missingRequiredFields.push('departureDate')
  if (!profile?.returnDate) missingRequiredFields.push('returnDate')
  if (!currency) missingRequiredFields.push('currency')

  const canSearchOffers = missingRequiredFields.length === 0
  const canSelectOffers = canSearchOffers
  const canGenerateItinerary = canSearchOffers && hasFlightSelection && hasHotelSelection
  const planningStatus = hasCompleteItinerary
    ? 'COMPLETE'
    : missingRequiredFields.length > 0
      ? 'ACTION_REQUIRED'
      : hasFlightSelection && hasHotelSelection
        ? 'OFFERS_SELECTED'
        : 'READY_FOR_SEARCH'

  return {
    planningStatus,
    missingRequiredFields,
    canSearchOffers,
    canSelectOffers,
    canGenerateItinerary,
  }
}

export function serializeTravelProfile(
  profile: TripTravelProfile | null,
  preferredCurrency?: string | null
): TripTravelProfileResponse | null {
  if (!profile) return null
  const currency = profile.currency ?? preferredCurrency ?? undefined
  return {
    id: profile.id,
    tripId: profile.tripId,
    originCity: profile.originCity ?? undefined,
    originCountry: profile.originCountry ?? undefined,
    originAirportCode: profile.originAirportCode ?? undefined,
    destinationAirportCode: profile.destinationAirportCode ?? undefined,
    departureDate: dateToDateOnly(profile.departureDate),
    returnDate: dateToDateOnly(profile.returnDate),
    adults: profile.adults,
    children: profile.children,
    infants: profile.infants,
    rooms: profile.rooms,
    cabinClass: profile.cabinClass,
    nonStopOnly: profile.nonStopOnly,
    currency,
    currencySource: profile.currency ? 'PERSISTED' : preferredCurrency ? 'PROFILE' : 'MISSING',
    flightSelectionStrategy: profile.flightSelectionStrategy,
    hotelSelectionStrategy: profile.hotelSelectionStrategy,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}

export class TripTravelProfileService {
  private readonly db: typeof prisma
  private readonly getPreferredCurrency: ProfileCurrencyDependency['getPreferredCurrency']

  constructor(dependencies: TripTravelProfileDependencies = {}) {
    this.db = dependencies.db ?? prisma
    this.getPreferredCurrency = dependencies.getPreferredCurrency ?? defaultGetPreferredCurrency
  }

  async getForTrip(input: {
    tripId: string
    userId: string
    hasCompleteItinerary?: boolean
  }): Promise<{ travelProfile: TripTravelProfileResponse | null; readiness: PlanningReadiness }> {
    const [profile, preferredCurrency, currentFlight, currentHotel] = await Promise.all([
      this.db.tripTravelProfile.findUnique({ where: { tripId: input.tripId } }),
      this.getPreferredCurrency(input.userId),
      this.db.tripFlightSelection.findFirst({
        where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
      }),
      this.db.tripHotelSelection.findFirst({
        where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
      }),
    ])
    const currency = profile?.currency ?? preferredCurrency

    return {
      travelProfile: serializeTravelProfile(profile, preferredCurrency),
      readiness: readiness(
        profile,
        currency,
        Boolean(currentFlight),
        Boolean(currentHotel),
        Boolean(input.hasCompleteItinerary)
      ),
    }
  }

  async upsert(input: {
    tripId: string
    userId: string
    data: TripTravelProfileUpdateInput
    hasCompleteItinerary?: boolean
  }): Promise<{ travelProfile: TripTravelProfileResponse; readiness: PlanningReadiness; invalidated: string[] }> {
    const existing = await this.db.tripTravelProfile.findUnique({ where: { tripId: input.tripId } })
    const normalized = normalizeInput(input.data)
    const merged = completeProfileDraft(existing, normalized)
    validateMergedProfile(merged)
    const changed = changedFields(existing, normalized)
    const invalidated: string[] = []

    const profile = await this.db.$transaction(async (tx) => {
      if (hasAny(changed, FLIGHT_CRITICAL_FIELDS)) {
        await tx.tripFlightSelection.updateMany({
          where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
          data: { status: 'INVALIDATED' as TripOfferSelectionStatus },
        })
        invalidated.push('flightSelection')
      }
      if (hasAny(changed, HOTEL_CRITICAL_FIELDS)) {
        await tx.tripHotelSelection.updateMany({
          where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
          data: { status: 'INVALIDATED' as TripOfferSelectionStatus },
        })
        invalidated.push('hotelSelection')
      }
      if (changed.size > 0) {
        await tx.tripBudgetSnapshot.updateMany({
          where: { tripId: input.tripId, status: 'CURRENT' as TripBudgetSnapshotStatus },
          data: { status: 'STALE' as TripBudgetSnapshotStatus },
        })
        invalidated.push('budgetSnapshot')
      }

      return tx.tripTravelProfile.upsert({
        where: { tripId: input.tripId },
        update: normalized,
        create: {
          tripId: input.tripId,
          ...normalized,
        },
      })
    })

    const preferredCurrency = await this.getPreferredCurrency(input.userId)
    const currentFlight = await this.db.tripFlightSelection.findFirst({
      where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
    })
    const currentHotel = await this.db.tripHotelSelection.findFirst({
      where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
    })

    return {
      travelProfile: serializeTravelProfile(profile, preferredCurrency)!,
      readiness: readiness(
        profile,
        profile.currency ?? preferredCurrency,
        Boolean(currentFlight),
        Boolean(currentHotel),
        Boolean(input.hasCompleteItinerary)
      ),
      invalidated: [...new Set(invalidated)],
    }
  }
}
