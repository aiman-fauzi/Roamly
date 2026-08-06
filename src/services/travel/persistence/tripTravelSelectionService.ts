import type { PreferenceSet, TripTravelProfile } from '@prisma/client'

import { prisma } from '@/db/client'
import { getPreferenceSet } from '@/services/preferenceService'
import {
  buildTravelSelectionFingerprint,
  TRAVEL_SELECTION_FINGERPRINT_VERSION,
  TRAVEL_SELECTION_PROVIDER,
} from '@/services/travel/persistence/travelSelectionFingerprint'
import {
  TripTravelPlanningService,
  type TripTravelPlanningPreviewResult,
} from '@/services/travel/planning/tripTravelPlanningService'
import { dateToDateOnly } from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import type { Trip } from '@/types/trip'

export type TravelSelectionState = 'none' | 'valid' | 'stale' | 'invalid'

export interface TravelSelectionSearchInputs {
  originAirportCode: string
  destinationAirportCode: string
  outboundDate: string
  returnDate: string
  travellers: number
  rooms: number
  cabinClass: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  currency: string
}

export interface SaveTravelSelectionInput extends TravelSelectionSearchInputs {
  selectedOutboundFlightId: string
  selectedReturnFlightId: string
  selectedHotelId: string
  expectedVersion: number
}

export interface TravelSelectionBaseResponse {
  state: TravelSelectionState
  version: number
  searchInputs?: TravelSelectionSearchInputs
  message?: string
  reasonCode?:
    | 'FINGERPRINT_MISMATCH'
    | 'FINGERPRINT_VERSION_UNSUPPORTED'
    | 'PROVIDER_UNSUPPORTED'
    | 'OFFER_IDS_UNSUPPORTED'
    | 'REGENERATION_FAILED'
    | 'PROFILE_INCOMPLETE'
}

export interface ValidTravelSelectionResponse extends TravelSelectionBaseResponse {
  state: 'valid'
  reviewedAt: string
  selectedOutboundFlightId: string
  selectedReturnFlightId: string
  selectedHotelId: string
  flightSearch: TripTravelPlanningPreviewResult['flightSearch']
  hotelSearch: TripTravelPlanningPreviewResult['hotelSearch']
  budgetSummary: TripTravelPlanningPreviewResult['budgetSummary']
  itineraryTravelContext: TripTravelPlanningPreviewResult['itineraryTravelContext']
  planningPreview: TripTravelPlanningPreviewResult['planningPreview']
}

export type TravelSelectionResponse = TravelSelectionBaseResponse | ValidTravelSelectionResponse

interface TripTravelSelectionDependencies {
  db?: typeof prisma
  getTrip?: (tripId: string, userId: string) => Promise<Trip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  previewBudget?: (
    input: Parameters<TripTravelPlanningService['previewBudget']>[0]
  ) => Promise<TripTravelPlanningPreviewResult>
  now?: () => Date
}

interface ResolvedPreview {
  result: TripTravelPlanningPreviewResult
  selectedFlightOfferId: string
  selectedHotelOfferId: string
}

export class TravelSelectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TravelSelectionError'
  }
}

function profileSearchInputs(profile: TripTravelProfile): TravelSelectionSearchInputs | null {
  const outboundDate = dateToDateOnly(profile.departureDate)
  const returnDate = dateToDateOnly(profile.returnDate)
  if (
    !profile.originAirportCode ||
    !profile.destinationAirportCode ||
    !outboundDate ||
    !returnDate ||
    !profile.currency
  ) {
    return null
  }

  return {
    originAirportCode: profile.originAirportCode,
    destinationAirportCode: profile.destinationAirportCode,
    outboundDate,
    returnDate,
    travellers: profile.adults + profile.children,
    rooms: profile.rooms,
    cabinClass: profile.cabinClass,
    currency: profile.currency,
  }
}

function planningInput(
  input: TravelSelectionSearchInputs,
  selected?: { selectedFlightOfferId: string; selectedHotelOfferId: string }
) {
  return {
    originAirportCode: input.originAirportCode,
    destinationAirportCode: input.destinationAirportCode,
    departureDate: input.outboundDate,
    returnDate: input.returnDate,
    checkInDate: input.outboundDate,
    checkOutDate: input.returnDate,
    adults: input.travellers,
    children: 0,
    infants: 0,
    rooms: input.rooms,
    cabinClass: input.cabinClass,
    currency: input.currency,
    persist: false,
    maxCandidates: 12,
    ...selected,
  }
}

function normalizedSearchInputs(input: TravelSelectionSearchInputs): TravelSelectionSearchInputs {
  return {
    ...input,
    originAirportCode: input.originAirportCode.toUpperCase(),
    destinationAirportCode: input.destinationAirportCode.toUpperCase(),
    cabinClass: input.cabinClass.toUpperCase() as TravelSelectionSearchInputs['cabinClass'],
    currency: input.currency.toUpperCase(),
  }
}

function assertSupportedScenario(destination: string, input: TravelSelectionSearchInputs) {
  if (!destination.toLowerCase().includes('phu quoc')) {
    throw new TravelSelectionError(
      'TRAVEL_SELECTION_DESTINATION_UNSUPPORTED',
      'Reviewed sample travel selections are currently supported only for Phu Quoc.',
      422
    )
  }
  if (input.originAirportCode !== 'KUL' || input.destinationAirportCode !== 'PQC') {
    throw new TravelSelectionError(
      'TRAVEL_SELECTION_ROUTE_UNSUPPORTED',
      'Reviewed sample travel selections are currently supported only for KUL to PQC.',
      422
    )
  }
}

function hasPersistedSelection(profile: TripTravelProfile): boolean {
  return Boolean(
    profile.selectedOutboundFlightId ||
      profile.selectedReturnFlightId ||
      profile.selectedHotelId ||
      profile.selectionFingerprint
  )
}

export class TripTravelSelectionService {
  private readonly db: typeof prisma
  private readonly getTrip: NonNullable<TripTravelSelectionDependencies['getTrip']>
  private readonly getPreferenceSet: NonNullable<
    TripTravelSelectionDependencies['getPreferenceSet']
  >
  private readonly previewBudget: NonNullable<TripTravelSelectionDependencies['previewBudget']>
  private readonly now: () => Date

  constructor(dependencies: TripTravelSelectionDependencies = {}) {
    this.db = dependencies.db ?? prisma
    this.getTrip = dependencies.getTrip ?? getTripById
    this.getPreferenceSet = dependencies.getPreferenceSet ?? getPreferenceSet
    this.previewBudget =
      dependencies.previewBudget ??
      ((input) => new TripTravelPlanningService().previewBudget(input))
    this.now = dependencies.now ?? (() => new Date())
  }

  async get(input: { tripId: string; userId: string }): Promise<TravelSelectionResponse> {
    const { profile, preferences } = await this.loadOwnedContext(input.tripId, input.userId)
    const searchInputs = profile ? profileSearchInputs(profile) : null
    if (!profile || !hasPersistedSelection(profile)) {
      return {
        state: 'none',
        version: profile?.selectionVersion ?? 0,
        searchInputs: searchInputs ?? undefined,
      }
    }
    if (!searchInputs) {
      return this.untrustedState(profile, 'invalid', 'PROFILE_INCOMPLETE')
    }
    if (profile.selectionProvider !== TRAVEL_SELECTION_PROVIDER) {
      return this.untrustedState(profile, 'invalid', 'PROVIDER_UNSUPPORTED', searchInputs)
    }
    if (profile.selectionFingerprintVersion !== TRAVEL_SELECTION_FINGERPRINT_VERSION) {
      return this.untrustedState(
        profile,
        'stale',
        'FINGERPRINT_VERSION_UNSUPPORTED',
        searchInputs
      )
    }

    const expectedFingerprint = buildTravelSelectionFingerprint({
      destination: preferences.destination!,
      ...searchInputs,
    })
    if (expectedFingerprint !== profile.selectionFingerprint) {
      return this.untrustedState(profile, 'stale', 'FINGERPRINT_MISMATCH', searchInputs)
    }
    if (
      !profile.selectedOutboundFlightId ||
      !profile.selectedReturnFlightId ||
      !profile.selectedHotelId ||
      !profile.selectionReviewedAt
    ) {
      return this.untrustedState(profile, 'invalid', 'OFFER_IDS_UNSUPPORTED', searchInputs)
    }

    try {
      const resolved = await this.resolveTrustedPreview({
        tripId: input.tripId,
        userId: input.userId,
        searchInputs,
        selectedOutboundFlightId: profile.selectedOutboundFlightId,
        selectedReturnFlightId: profile.selectedReturnFlightId,
        selectedHotelId: profile.selectedHotelId,
      })
      return this.validResponse({
        profile,
        searchInputs,
        resolved,
        reviewedAt: profile.selectionReviewedAt,
      })
    } catch (error) {
      if (error instanceof TravelSelectionError && error.code === 'OFFER_IDS_UNSUPPORTED') {
        return this.untrustedState(profile, 'invalid', 'OFFER_IDS_UNSUPPORTED', searchInputs)
      }
      return this.untrustedState(profile, 'invalid', 'REGENERATION_FAILED', searchInputs)
    }
  }

  async save(input: {
    tripId: string
    userId: string
    selection: SaveTravelSelectionInput
  }): Promise<ValidTravelSelectionResponse> {
    const { profile, preferences } = await this.loadOwnedContext(input.tripId, input.userId)
    if (!profile) {
      throw new TravelSelectionError(
        'TRAVEL_PROFILE_NOT_FOUND',
        'Search for sample travel options before reviewing a selection.',
        400
      )
    }

    const searchInputs = normalizedSearchInputs(input.selection)
    assertSupportedScenario(preferences.destination!, searchInputs)
    const resolved = await this.resolveTrustedPreview({
      tripId: input.tripId,
      userId: input.userId,
      searchInputs,
      selectedOutboundFlightId: input.selection.selectedOutboundFlightId,
      selectedReturnFlightId: input.selection.selectedReturnFlightId,
      selectedHotelId: input.selection.selectedHotelId,
    })
    const fingerprint = buildTravelSelectionFingerprint({
      destination: preferences.destination!,
      ...searchInputs,
    })
    const reviewedAt = this.now()
    const updated = await this.db.tripTravelProfile.updateMany({
      where: {
        tripId: input.tripId,
        selectionVersion: input.selection.expectedVersion,
      },
      data: {
        originAirportCode: searchInputs.originAirportCode,
        destinationAirportCode: searchInputs.destinationAirportCode,
        departureDate: new Date(`${searchInputs.outboundDate}T00:00:00.000Z`),
        returnDate: new Date(`${searchInputs.returnDate}T00:00:00.000Z`),
        adults: searchInputs.travellers,
        children: 0,
        infants: 0,
        rooms: searchInputs.rooms,
        cabinClass: searchInputs.cabinClass,
        currency: searchInputs.currency,
        selectedOutboundFlightId: input.selection.selectedOutboundFlightId,
        selectedReturnFlightId: input.selection.selectedReturnFlightId,
        selectedHotelId: input.selection.selectedHotelId,
        selectionFingerprint: fingerprint,
        selectionFingerprintVersion: TRAVEL_SELECTION_FINGERPRINT_VERSION,
        selectionProvider: TRAVEL_SELECTION_PROVIDER,
        selectionReviewedAt: reviewedAt,
        selectionVersion: { increment: 1 },
      },
    })
    if (updated.count !== 1) {
      throw new TravelSelectionError(
        'TRAVEL_SELECTION_VERSION_CONFLICT',
        'This trip was reviewed in another browser session. Reload before saving again.',
        409
      )
    }

    return this.validResponse({
      profile: { ...profile, selectionVersion: input.selection.expectedVersion + 1 },
      searchInputs,
      resolved,
      reviewedAt,
      selectedOutboundFlightId: input.selection.selectedOutboundFlightId,
      selectedReturnFlightId: input.selection.selectedReturnFlightId,
      selectedHotelId: input.selection.selectedHotelId,
    })
  }

  async clear(input: {
    tripId: string
    userId: string
    expectedVersion: number
  }): Promise<TravelSelectionResponse> {
    const { profile } = await this.loadOwnedContext(input.tripId, input.userId)
    if (!profile || !hasPersistedSelection(profile)) {
      return { state: 'none', version: profile?.selectionVersion ?? 0 }
    }

    const updated = await this.db.tripTravelProfile.updateMany({
      where: { tripId: input.tripId, selectionVersion: input.expectedVersion },
      data: {
        selectedOutboundFlightId: null,
        selectedReturnFlightId: null,
        selectedHotelId: null,
        selectionFingerprint: null,
        selectionFingerprintVersion: null,
        selectionProvider: null,
        selectionReviewedAt: null,
        selectionVersion: { increment: 1 },
      },
    })
    if (updated.count !== 1) {
      throw new TravelSelectionError(
        'TRAVEL_SELECTION_VERSION_CONFLICT',
        'This trip was updated in another browser session. Reload before clearing it.',
        409
      )
    }

    return {
      state: 'none',
      version: input.expectedVersion + 1,
      searchInputs: profileSearchInputs(profile) ?? undefined,
    }
  }

  private async loadOwnedContext(tripId: string, userId: string) {
    const trip = await this.getTrip(tripId, userId)
    if (!trip) throw new TravelSelectionError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    const [profile, preferences] = await Promise.all([
      this.db.tripTravelProfile.findUnique({ where: { tripId } }),
      this.getPreferenceSet(tripId),
    ])
    if (!preferences?.destination) {
      throw new TravelSelectionError(
        'PREFERENCES_NOT_FOUND',
        'Trip destination preferences are missing.',
        400
      )
    }
    return { trip, profile, preferences }
  }

  private async resolveTrustedPreview(input: {
    tripId: string
    userId: string
    searchInputs: TravelSelectionSearchInputs
    selectedOutboundFlightId: string
    selectedReturnFlightId: string
    selectedHotelId: string
  }): Promise<ResolvedPreview> {
    const initial = await this.previewBudget({
      tripId: input.tripId,
      userId: input.userId,
      input: planningInput(input.searchInputs),
    })
    const selectedFlightOffer = initial.flightSearch.offers.find(
      (offer) =>
        offer.mockFlightPair?.outboundFlightId === input.selectedOutboundFlightId &&
        offer.mockFlightPair?.returnFlightId === input.selectedReturnFlightId
    )
    const selectedHotelOffer = initial.hotelSearch.offers.find(
      (offer) => offer.mockHotel?.hotelId === input.selectedHotelId
    )
    if (!selectedFlightOffer || !selectedHotelOffer) {
      throw new TravelSelectionError(
        'OFFER_IDS_UNSUPPORTED',
        'One or more selected sample travel options are no longer available.',
        422
      )
    }

    const result = await this.previewBudget({
      tripId: input.tripId,
      userId: input.userId,
      input: planningInput(input.searchInputs, {
        selectedFlightOfferId: selectedFlightOffer.id,
        selectedHotelOfferId: selectedHotelOffer.id,
      }),
    })
    if (
      result.itineraryTravelContext.outboundFlight.id !== input.selectedOutboundFlightId ||
      result.itineraryTravelContext.returnFlight.id !== input.selectedReturnFlightId ||
      result.itineraryTravelContext.hotel.id !== input.selectedHotelId ||
      result.itineraryTravelContext.dataStatus !== 'mock'
    ) {
      throw new TravelSelectionError(
        'OFFER_IDS_UNSUPPORTED',
        'The regenerated sample travel options did not match the reviewed identifiers.',
        422
      )
    }

    return {
      result,
      selectedFlightOfferId: selectedFlightOffer.id,
      selectedHotelOfferId: selectedHotelOffer.id,
    }
  }

  private validResponse(input: {
    profile: TripTravelProfile
    searchInputs: TravelSelectionSearchInputs
    resolved: ResolvedPreview
    reviewedAt: Date
    selectedOutboundFlightId?: string
    selectedReturnFlightId?: string
    selectedHotelId?: string
  }): ValidTravelSelectionResponse {
    const context = input.resolved.result.itineraryTravelContext
    return {
      state: 'valid',
      version: input.profile.selectionVersion,
      reviewedAt: input.reviewedAt.toISOString(),
      searchInputs: input.searchInputs,
      selectedOutboundFlightId:
        input.selectedOutboundFlightId ?? input.profile.selectedOutboundFlightId!,
      selectedReturnFlightId:
        input.selectedReturnFlightId ?? input.profile.selectedReturnFlightId!,
      selectedHotelId: input.selectedHotelId ?? input.profile.selectedHotelId!,
      flightSearch: input.resolved.result.flightSearch,
      hotelSearch: input.resolved.result.hotelSearch,
      budgetSummary: input.resolved.result.budgetSummary,
      itineraryTravelContext: context,
      planningPreview: input.resolved.result.planningPreview,
      message: 'Your reviewed sample travel options have been restored.',
    }
  }

  private untrustedState(
    profile: TripTravelProfile,
    state: 'stale' | 'invalid',
    reasonCode: NonNullable<TravelSelectionBaseResponse['reasonCode']>,
    searchInputs?: TravelSelectionSearchInputs
  ): TravelSelectionResponse {
    return {
      state,
      version: profile.selectionVersion,
      searchInputs,
      reasonCode,
      message:
        state === 'stale'
          ? 'Your trip details changed, so please review the latest sample travel options.'
          : 'Your saved sample travel options could not be verified. Please review the latest options.',
    }
  }
}
