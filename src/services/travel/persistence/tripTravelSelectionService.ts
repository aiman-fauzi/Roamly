import type { PreferenceSet, TripTravelProfile } from '@prisma/client'

import { prisma } from '@/db/client'
import type { RequestTiming } from '@/lib/observability/requestTiming'
import {
  DestinationRetrievalService,
  resolveDestinationCity,
  type DestinationCityResolution,
} from '@/services/destinations/destinationRetrievalService'
import type { DestinationRetrievalResult } from '@/services/destinations/types'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import {
  buildTravelSelectionFingerprint,
  TRAVEL_SELECTION_FINGERPRINT_VERSION,
  TRAVEL_SELECTION_PROVIDER,
} from '@/services/travel/persistence/travelSelectionFingerprint'
import type { ItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'
import {
  buildDestinationPlanningPreview,
  buildTrustedTravelBudgetContext,
  buildTrustedTravelSelectionContext,
  TrustedTravelContextError,
  TrustedTravelRequestScope,
  type TrustedTravelBudgetContext,
  type TrustedTravelSearchInputs,
} from '@/services/travel/planning/trustedTravelSelectionContext'
import { dateToDateOnly } from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import type { TripWithPreferences } from '@/types/trip'

export type TravelSelectionState = 'none' | 'valid' | 'stale' | 'invalid'
export type TravelSelectionSearchInputs = TrustedTravelSearchInputs

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
  flightSearch: TrustedTravelBudgetContext['flightSearch']
  hotelSearch: TrustedTravelBudgetContext['hotelSearch']
  budgetSummary: TrustedTravelBudgetContext['budgetSummary']
  itineraryTravelContext: TrustedTravelBudgetContext['itineraryTravelContext']
  planningPreview: TrustedTravelBudgetContext['itineraryTravelContext']['planningPreview']
}

export interface DestinationPlanningPreviewResponse {
  planningPreview: ItineraryTravelContext['planningPreview']
  eligibleCandidates: number
  message: string
}

export type TravelSelectionResponse = TravelSelectionBaseResponse | ValidTravelSelectionResponse

type SelectionOwnedTrip = TripWithPreferences & {
  travelProfile?: TripTravelProfile | null
}

interface TripTravelSelectionDependencies {
  db?: typeof prisma
  getTrip?: (tripId: string, userId: string) => Promise<SelectionOwnedTrip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  getTravelInterests?: (userId: string) => Promise<string[]>
  resolveCity?: (destination: string) => Promise<DestinationCityResolution | null>
  retrieveDestinations?: (query: {
    cityId: string
    travelStyles: string[]
    interests: string[]
    budgetLevel?: string
    limitPerType: number
    includeTypes?: ['ATTRACTION']
  }) => Promise<DestinationRetrievalResult>
  buildPlanningPreview?: typeof buildDestinationPlanningPreview
  buildTrustedContext?: (input: {
    destination: string
    durationDays: number
    userBudget: number
    searchInputs: TravelSelectionSearchInputs
    selectedOutboundFlightId: string
    selectedReturnFlightId: string
    selectedHotelId: string
    fingerprint?: string
    timing?: RequestTiming
  }) => Promise<TrustedTravelBudgetContext>
  now?: () => Date
}

interface OwnedSelectionContext {
  trip: SelectionOwnedTrip
  profile: TripTravelProfile | null
  preferences: PreferenceSet
}

interface RestoredSelection {
  response: TravelSelectionResponse
  trustedContext?: TrustedTravelBudgetContext
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

function requirePlanningFields(preferences: PreferenceSet) {
  if (!preferences.destination || preferences.durationDays == null || preferences.budget == null) {
    throw new TravelSelectionError(
      'PREFERENCES_NOT_FOUND',
      'Trip destination, duration, and budget preferences are required.',
      400
    )
  }
  return {
    destination: preferences.destination,
    durationDays: preferences.durationDays,
    userBudget: preferences.budget,
  }
}

function readBudgetLevel(travelStyles: string[]): string | undefined {
  if (travelStyles.includes('luxury')) return 'luxury'
  if (travelStyles.includes('budget')) return 'budget'
  return undefined
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
  private readonly getTravelInterests: NonNullable<
    TripTravelSelectionDependencies['getTravelInterests']
  >
  private readonly resolveCity: NonNullable<TripTravelSelectionDependencies['resolveCity']>
  private readonly retrieveDestinations: NonNullable<
    TripTravelSelectionDependencies['retrieveDestinations']
  >
  private readonly buildTrustedContext: NonNullable<
    TripTravelSelectionDependencies['buildTrustedContext']
  >
  private readonly buildPlanningPreview: typeof buildDestinationPlanningPreview
  private readonly now: () => Date

  constructor(dependencies: TripTravelSelectionDependencies = {}) {
    this.db = dependencies.db ?? prisma
    this.getTrip = dependencies.getTrip ?? getTripById
    this.getPreferenceSet = dependencies.getPreferenceSet ?? getPreferenceSet
    this.getTravelInterests =
      dependencies.getTravelInterests ??
      (async (userId) => (await getProfileSummary(userId)).profile.travelInterests)
    this.resolveCity = dependencies.resolveCity ?? resolveDestinationCity
    this.retrieveDestinations =
      dependencies.retrieveDestinations ??
      ((query) => new DestinationRetrievalService().retrieve(query))
    this.buildTrustedContext =
      dependencies.buildTrustedContext ??
      (async (input) => {
        const scope = new TrustedTravelRequestScope(
          {
            destination: input.destination,
            durationDays: input.durationDays,
            userBudget: input.userBudget,
            searchInputs: input.searchInputs,
            fingerprint: input.fingerprint,
          },
          {},
          input.timing
        )
        const selection = await buildTrustedTravelSelectionContext(scope, input)
        return buildTrustedTravelBudgetContext(scope, selection)
      })
    this.buildPlanningPreview = dependencies.buildPlanningPreview ?? buildDestinationPlanningPreview
    this.now = dependencies.now ?? (() => new Date())
  }

  async get(input: {
    tripId: string
    userId: string
    ownedTrip?: SelectionOwnedTrip
    timing?: RequestTiming
  }): Promise<TravelSelectionResponse> {
    input.timing?.record('destination_retrieval', 0)
    const context = await this.loadOwnedContext(input)
    return (await this.restoreFromContext(context, input.timing)).response
  }

  async save(input: {
    tripId: string
    userId: string
    ownedTrip?: SelectionOwnedTrip
    selection: SaveTravelSelectionInput
    timing?: RequestTiming
  }): Promise<ValidTravelSelectionResponse> {
    input.timing?.record('destination_retrieval', 0)
    const { profile, preferences } = await this.loadOwnedContext(input)
    if (!profile) {
      throw new TravelSelectionError(
        'TRAVEL_PROFILE_NOT_FOUND',
        'Search for sample travel options before reviewing a selection.',
        400
      )
    }

    const planning = requirePlanningFields(preferences)
    const searchInputs = normalizedSearchInputs(input.selection)
    assertSupportedScenario(planning.destination, searchInputs)
    const trustedContext = await this.regenerate({
      ...planning,
      searchInputs,
      selectedOutboundFlightId: input.selection.selectedOutboundFlightId,
      selectedReturnFlightId: input.selection.selectedReturnFlightId,
      selectedHotelId: input.selection.selectedHotelId,
      timing: input.timing,
    })
    const reviewedAt = this.now()
    const write = () =>
      this.db.tripTravelProfile.updateMany({
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
          selectionFingerprint: trustedContext.fingerprint,
          selectionFingerprintVersion: TRAVEL_SELECTION_FINGERPRINT_VERSION,
          selectionProvider: TRAVEL_SELECTION_PROVIDER,
          selectionReviewedAt: reviewedAt,
          selectionVersion: { increment: 1 },
        },
      })
    const updated = input.timing
      ? await input.timing.measure('database_write', write)
      : await write()
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
      trustedContext,
      reviewedAt,
      selectedOutboundFlightId: input.selection.selectedOutboundFlightId,
      selectedReturnFlightId: input.selection.selectedReturnFlightId,
      selectedHotelId: input.selection.selectedHotelId,
    })
  }

  async clear(input: {
    tripId: string
    userId: string
    ownedTrip?: SelectionOwnedTrip
    expectedVersion: number
    timing?: RequestTiming
  }): Promise<TravelSelectionResponse> {
    input.timing?.record('destination_retrieval', 0)
    input.timing?.record('gemini_invocation', 0)
    const { profile } = await this.loadOwnedContext(input)
    if (!profile || !hasPersistedSelection(profile)) {
      return { state: 'none', version: profile?.selectionVersion ?? 0 }
    }

    const write = () =>
      this.db.tripTravelProfile.updateMany({
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
    const updated = input.timing
      ? await input.timing.measure('database_write', write)
      : await write()
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

  async getPlanningPreview(input: {
    tripId: string
    userId: string
    ownedTrip?: SelectionOwnedTrip
    timing?: RequestTiming
  }): Promise<DestinationPlanningPreviewResponse> {
    const context = await this.loadOwnedContext(input)
    const restored = await this.restoreFromContext(context, input.timing)
    if (restored.response.state !== 'valid' || !restored.trustedContext) {
      throw new TravelSelectionError(
        'TRAVEL_SELECTION_NOT_REVIEWED',
        'Review the current sample travel options before loading planning recommendations.',
        409
      )
    }

    const planning = requirePlanningFields(context.preferences)
    const metadata = () =>
      Promise.all([
        this.resolveCity(planning.destination),
        this.getTravelInterests(context.trip.userId),
      ])
    const [city, travelInterests] = input.timing
      ? await input.timing.measure('destination_metadata', metadata)
      : await metadata()
    if (!city) {
      throw new TravelSelectionError(
        'DESTINATION_CITY_NOT_FOUND',
        'Destination city is not available in the destination database.',
        400
      )
    }

    const retrieve = () =>
      this.retrieveDestinations({
        cityId: city.id,
        travelStyles: context.preferences.travelStyles,
        interests: [
          ...context.preferences.activityPreferences,
          ...context.preferences.foodPreferences,
          ...travelInterests,
        ],
        budgetLevel: readBudgetLevel(context.preferences.travelStyles),
        limitPerType: 8,
        includeTypes: ['ATTRACTION'],
      })
    const destinations = input.timing
      ? await input.timing.measure('destination_retrieval', retrieve)
      : await retrieve()
    const planningPreview = this.buildPlanningPreview({
      context: restored.trustedContext,
      destinationCandidates: destinations.candidates,
      timing: input.timing,
    })
    if (!planningPreview.strictCandidateIds) {
      throw new TravelSelectionError(
        'DESTINATION_CANDIDATE_CONTRACT_VIOLATION',
        'Planning recommendations contained unsupported destination records.',
        422
      )
    }

    return {
      planningPreview,
      eligibleCandidates: destinations.candidates.length,
      message: 'Destination planning recommendations are ready.',
    }
  }

  private async loadOwnedContext(input: {
    tripId: string
    userId: string
    ownedTrip?: SelectionOwnedTrip
    timing?: RequestTiming
  }): Promise<OwnedSelectionContext> {
    const tripWork = () => this.getTrip(input.tripId, input.userId)
    const trip = input.ownedTrip
      ? input.ownedTrip
      : input.timing
        ? await input.timing.measure('trip_ownership_lookup', tripWork)
        : await tripWork()
    if (!trip || trip.id !== input.tripId || trip.userId !== input.userId) {
      throw new TravelSelectionError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    }

    const load = () =>
      Promise.all([
        trip.travelProfile !== undefined
          ? Promise.resolve(trip.travelProfile)
          : this.db.tripTravelProfile.findUnique({ where: { tripId: input.tripId } }),
        trip.preferenceSet
          ? Promise.resolve(trip.preferenceSet)
          : this.getPreferenceSet(input.tripId),
      ])
    const [profile, preferences] = input.timing
      ? await input.timing.measure('trip_profile_loading', load)
      : await load()
    if (!preferences?.destination) {
      throw new TravelSelectionError(
        'PREFERENCES_NOT_FOUND',
        'Trip destination preferences are missing.',
        400
      )
    }
    return { trip, profile, preferences }
  }

  private async restoreFromContext(
    context: OwnedSelectionContext,
    timing?: RequestTiming
  ): Promise<RestoredSelection> {
    const { profile, preferences } = context
    const searchInputs = profile ? profileSearchInputs(profile) : null
    if (!profile || !hasPersistedSelection(profile)) {
      return {
        response: {
          state: 'none',
          version: profile?.selectionVersion ?? 0,
          searchInputs: searchInputs ?? undefined,
        },
      }
    }
    if (!searchInputs) {
      return { response: this.untrustedState(profile, 'invalid', 'PROFILE_INCOMPLETE') }
    }
    if (profile.selectionProvider !== TRAVEL_SELECTION_PROVIDER) {
      return {
        response: this.untrustedState(profile, 'invalid', 'PROVIDER_UNSUPPORTED', searchInputs),
      }
    }
    if (profile.selectionFingerprintVersion !== TRAVEL_SELECTION_FINGERPRINT_VERSION) {
      return {
        response: this.untrustedState(
          profile,
          'stale',
          'FINGERPRINT_VERSION_UNSUPPORTED',
          searchInputs
        ),
      }
    }
    if (
      !profile.selectedOutboundFlightId ||
      !profile.selectedReturnFlightId ||
      !profile.selectedHotelId ||
      !profile.selectionReviewedAt
    ) {
      return {
        response: this.untrustedState(profile, 'invalid', 'OFFER_IDS_UNSUPPORTED', searchInputs),
      }
    }

    const planning = requirePlanningFields(preferences)
    const trustedInput: Parameters<
      NonNullable<TripTravelSelectionDependencies['buildTrustedContext']>
    >[0] = {
      ...planning,
      searchInputs,
      selectedOutboundFlightId: profile.selectedOutboundFlightId,
      selectedReturnFlightId: profile.selectedReturnFlightId,
      selectedHotelId: profile.selectedHotelId,
      timing,
    }
    const fingerprint = timing
      ? timing.measureSync('fingerprint_generation', () =>
          buildTravelSelectionFingerprint({ destination: planning.destination, ...searchInputs })
        )
      : buildTravelSelectionFingerprint({ destination: planning.destination, ...searchInputs })
    if (fingerprint !== profile.selectionFingerprint) {
      return {
        response: this.untrustedState(profile, 'stale', 'FINGERPRINT_MISMATCH', searchInputs),
      }
    }

    trustedInput.fingerprint = fingerprint

    try {
      const trustedContext = await this.regenerate(trustedInput)
      return {
        trustedContext,
        response: this.validResponse({
          profile,
          searchInputs,
          trustedContext,
          reviewedAt: profile.selectionReviewedAt,
        }),
      }
    } catch (error) {
      if (error instanceof TravelSelectionError && error.code === 'OFFER_IDS_UNSUPPORTED') {
        return {
          response: this.untrustedState(profile, 'invalid', 'OFFER_IDS_UNSUPPORTED', searchInputs),
        }
      }
      return {
        response: this.untrustedState(profile, 'invalid', 'REGENERATION_FAILED', searchInputs),
      }
    }
  }

  private async regenerate(
    input: Parameters<NonNullable<TripTravelSelectionDependencies['buildTrustedContext']>>[0]
  ): Promise<TrustedTravelBudgetContext> {
    try {
      return await this.buildTrustedContext(input)
    } catch (error) {
      if (error instanceof TrustedTravelContextError && error.code === 'OFFER_IDS_UNSUPPORTED') {
        throw new TravelSelectionError('OFFER_IDS_UNSUPPORTED', error.message, 422)
      }
      throw error
    }
  }

  private validResponse(input: {
    profile: TripTravelProfile
    searchInputs: TravelSelectionSearchInputs
    trustedContext: TrustedTravelBudgetContext
    reviewedAt: Date
    selectedOutboundFlightId?: string
    selectedReturnFlightId?: string
    selectedHotelId?: string
  }): ValidTravelSelectionResponse {
    return {
      state: 'valid',
      version: input.profile.selectionVersion,
      reviewedAt: input.reviewedAt.toISOString(),
      searchInputs: input.searchInputs,
      selectedOutboundFlightId:
        input.selectedOutboundFlightId ?? input.profile.selectedOutboundFlightId!,
      selectedReturnFlightId: input.selectedReturnFlightId ?? input.profile.selectedReturnFlightId!,
      selectedHotelId: input.selectedHotelId ?? input.profile.selectedHotelId!,
      flightSearch: input.trustedContext.flightSearch,
      hotelSearch: input.trustedContext.hotelSearch,
      budgetSummary: input.trustedContext.budgetSummary,
      itineraryTravelContext: input.trustedContext.itineraryTravelContext,
      planningPreview: input.trustedContext.itineraryTravelContext.planningPreview,
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
