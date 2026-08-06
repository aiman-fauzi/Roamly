import type { RequestTiming } from '@/lib/observability/requestTiming'
import type { RankedDestinationCandidate } from '@/services/destinations/types'
import { TripBudgetService } from '@/services/travel/budget/tripBudgetService'
import type { TripBudgetSummary } from '@/services/travel/budget/types'
import { money } from '@/services/travel/offers/money'
import { createDefaultTravelOfferService } from '@/services/travel/offers/travelOfferService'
import type {
  FlightOffer,
  FlightSearchRequest,
  FlightSearchResult,
  HotelOffer,
  HotelSearchRequest,
  HotelSearchResult,
} from '@/services/travel/offers/types'
import {
  buildTravelSelectionFingerprint,
  TRAVEL_SELECTION_FINGERPRINT_VERSION,
  TRAVEL_SELECTION_PROVIDER,
} from '@/services/travel/persistence/travelSelectionFingerprint'
import {
  buildItineraryTravelContext,
  type ItineraryTravelContext,
} from '@/services/travel/planning/liveTravelContext'

export interface TrustedTravelSearchInputs {
  originAirportCode: string
  destinationAirportCode: string
  outboundDate: string
  returnDate: string
  travellers: number
  rooms: number
  cabinClass: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  currency: string
}

export interface TrustedSelectedIds {
  selectedOutboundFlightId: string
  selectedReturnFlightId: string
  selectedHotelId: string
}

export interface TrustedTravelSelectionContext {
  fingerprint: string
  searchInputs: TrustedTravelSearchInputs
  flightSearch: FlightSearchResult
  hotelSearch: HotelSearchResult
  selectedFlightOffer: FlightOffer
  selectedHotelOffer: HotelOffer
}

export interface TrustedTravelBudgetContext extends TrustedTravelSelectionContext {
  budgetSummary: TripBudgetSummary
  itineraryTravelContext: ItineraryTravelContext
}

interface TrustedTravelRequestInput {
  destination: string
  durationDays: number
  userBudget: number
  searchInputs: TrustedTravelSearchInputs
  fingerprint?: string
}

interface TrustedTravelRequestDependencies {
  searchFlights?: (request: FlightSearchRequest) => Promise<FlightSearchResult>
  searchHotels?: (request: HotelSearchRequest) => Promise<HotelSearchResult>
  calculateBudget?: (
    input: Parameters<TripBudgetService['calculate']>[0]
  ) => Promise<TripBudgetSummary>
}

export class TrustedTravelContextError extends Error {
  constructor(
    public readonly code: 'OFFER_IDS_UNSUPPORTED' | 'TRAVEL_OFFERS_UNAVAILABLE',
    message: string
  ) {
    super(message)
    this.name = 'TrustedTravelContextError'
  }
}

function normalizeSearchInputs(input: TrustedTravelSearchInputs): TrustedTravelSearchInputs {
  return {
    ...input,
    originAirportCode: input.originAirportCode.toUpperCase(),
    destinationAirportCode: input.destinationAirportCode.toUpperCase(),
    cabinClass: input.cabinClass.toUpperCase() as TrustedTravelSearchInputs['cabinClass'],
    currency: input.currency.toUpperCase(),
  }
}

function destinationCacheKey(destination: string): string {
  return destination
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export class TrustedTravelRequestScope {
  readonly searchInputs: TrustedTravelSearchInputs
  private readonly searchFlights: NonNullable<TrustedTravelRequestDependencies['searchFlights']>
  private readonly searchHotels: NonNullable<TrustedTravelRequestDependencies['searchHotels']>
  private readonly calculateBudget: NonNullable<TrustedTravelRequestDependencies['calculateBudget']>
  private offersPromise?: Promise<{
    flightSearch: FlightSearchResult
    hotelSearch: HotelSearchResult
  }>
  private fingerprintValue?: string
  private readonly selectionPromises = new Map<string, Promise<TrustedTravelSelectionContext>>()
  private readonly budgetPromises = new Map<string, Promise<TripBudgetSummary>>()

  constructor(
    readonly input: TrustedTravelRequestInput,
    dependencies: TrustedTravelRequestDependencies = {},
    readonly timing?: RequestTiming
  ) {
    const offerService = createDefaultTravelOfferService()
    this.searchInputs = normalizeSearchInputs(input.searchInputs)
    this.fingerprintValue = input.fingerprint
    this.timing?.record('exchange_rate_lookup', 0)
    this.timing?.record('gemini_invocation', 0)
    this.searchFlights =
      dependencies.searchFlights ?? ((request) => offerService.searchFlights(request))
    this.searchHotels =
      dependencies.searchHotels ?? ((request) => offerService.searchHotels(request))
    this.calculateBudget =
      dependencies.calculateBudget ??
      ((budgetInput) => new TripBudgetService().calculate(budgetInput))
  }

  fingerprint(): string {
    this.fingerprintValue ??= this.timing
      ? this.timing.measureSync('fingerprint_generation', () =>
          buildTravelSelectionFingerprint({
            destination: this.input.destination,
            ...this.searchInputs,
          })
        )
      : buildTravelSelectionFingerprint({
          destination: this.input.destination,
          ...this.searchInputs,
        })
    return this.fingerprintValue
  }

  async offers(): Promise<{ flightSearch: FlightSearchResult; hotelSearch: HotelSearchResult }> {
    this.offersPromise ??= this.generateOffers()
    return this.offersPromise
  }

  async budget(input: {
    selectedFlightOffer: FlightOffer
    selectedHotelOffer: HotelOffer
  }): Promise<TripBudgetSummary> {
    const key = `${input.selectedFlightOffer.id}:${input.selectedHotelOffer.id}`
    const existing = this.budgetPromises.get(key)
    if (existing) return existing
    const work = () =>
      this.calculateBudget({
        currency: this.searchInputs.currency,
        destinationCurrency: this.searchInputs.currency,
        travelerCount: this.searchInputs.travellers,
        durationDays: this.input.durationDays,
        userBudget: money(this.input.userBudget, this.searchInputs.currency),
        selectedFlightOffer: input.selectedFlightOffer,
        selectedHotelOffer: input.selectedHotelOffer,
        destinationCandidates: [],
      })
    const promise = this.timing ? this.timing.measure('budget_calculation', work) : work()
    this.budgetPromises.set(key, promise)
    return promise
  }

  async selection(selectedIds: TrustedSelectedIds): Promise<TrustedTravelSelectionContext> {
    const key = [
      selectedIds.selectedOutboundFlightId,
      selectedIds.selectedReturnFlightId,
      selectedIds.selectedHotelId,
    ].join(':')
    const existing = this.selectionPromises.get(key)
    if (existing) return existing
    const promise = this.resolveSelection(selectedIds)
    this.selectionPromises.set(key, promise)
    return promise
  }

  private async generateOffers() {
    const flightRequest: FlightSearchRequest = {
      originAirportCode: this.searchInputs.originAirportCode,
      destinationAirportCode: this.searchInputs.destinationAirportCode,
      departureDate: this.searchInputs.outboundDate,
      returnDate: this.searchInputs.returnDate,
      adults: this.searchInputs.travellers,
      children: 0,
      infants: 0,
      cabinClass: this.searchInputs.cabinClass,
      currency: this.searchInputs.currency,
      nonStopOnly: false,
    }
    const hotelRequest: HotelSearchRequest = {
      cityId: destinationCacheKey(this.input.destination),
      checkInDate: this.searchInputs.outboundDate,
      checkOutDate: this.searchInputs.returnDate,
      adults: this.searchInputs.travellers,
      children: 0,
      rooms: this.searchInputs.rooms,
      currency: this.searchInputs.currency,
    }

    const flightStartedAt = performance.now()
    const hotelStartedAt = performance.now()
    const flightPromise = this.searchFlights(flightRequest).finally(() => {
      this.timing?.record('deterministic_flight_generation', performance.now() - flightStartedAt)
    })
    const hotelPromise = this.searchHotels(hotelRequest).finally(() => {
      this.timing?.record('deterministic_hotel_generation', performance.now() - hotelStartedAt)
    })
    const [flightSearch, hotelSearch] = await Promise.all([flightPromise, hotelPromise])
    const cacheStatuses = [flightSearch.cacheStatus, hotelSearch.cacheStatus]
    if (cacheStatuses.includes('MISS') || cacheStatuses.includes('REFRESHED')) {
      this.timing?.setCacheStatus('miss')
    } else if (cacheStatuses.includes('COALESCED')) {
      this.timing?.setCacheStatus('coalesced')
    } else if (cacheStatuses.every((status) => status === 'HIT')) {
      this.timing?.setCacheStatus('hit')
    }
    if (flightSearch.status !== 'SUCCESS' || hotelSearch.status !== 'SUCCESS') {
      throw new TrustedTravelContextError(
        'TRAVEL_OFFERS_UNAVAILABLE',
        'Trusted sample travel options could not be regenerated.'
      )
    }
    return { flightSearch, hotelSearch }
  }

  private async resolveSelection(
    selectedIds: TrustedSelectedIds
  ): Promise<TrustedTravelSelectionContext> {
    const { flightSearch, hotelSearch } = await this.offers()
    const resolve = () => {
      const selectedFlightOffer = flightSearch.offers.find(
        (offer) =>
          offer.mockFlightPair?.outboundFlightId === selectedIds.selectedOutboundFlightId &&
          offer.mockFlightPair?.returnFlightId === selectedIds.selectedReturnFlightId
      )
      const selectedHotelOffer = hotelSearch.offers.find(
        (offer) => offer.mockHotel?.hotelId === selectedIds.selectedHotelId
      )
      if (!selectedFlightOffer || !selectedHotelOffer) {
        throw new TrustedTravelContextError(
          'OFFER_IDS_UNSUPPORTED',
          'One or more selected sample travel options are no longer available.'
        )
      }
      if (
        selectedFlightOffer.dataStatus !== 'mock' ||
        selectedHotelOffer.dataStatus !== 'mock' ||
        selectedFlightOffer.mockFlightPair?.outbound.id !== selectedIds.selectedOutboundFlightId ||
        selectedFlightOffer.mockFlightPair?.return.id !== selectedIds.selectedReturnFlightId ||
        selectedHotelOffer.mockHotel?.option.id !== selectedIds.selectedHotelId
      ) {
        throw new TrustedTravelContextError(
          'OFFER_IDS_UNSUPPORTED',
          'The regenerated sample travel options did not match the reviewed identifiers.'
        )
      }
      return { selectedFlightOffer, selectedHotelOffer }
    }
    const selected = this.timing
      ? this.timing.measureSync('selected_id_resolution', resolve)
      : resolve()

    return {
      fingerprint: this.fingerprint(),
      searchInputs: this.searchInputs,
      flightSearch,
      hotelSearch,
      ...selected,
    }
  }
}

export async function buildTrustedTravelSelectionContext(
  scope: TrustedTravelRequestScope,
  selectedIds: TrustedSelectedIds
): Promise<TrustedTravelSelectionContext> {
  return scope.selection(selectedIds)
}

export async function buildTrustedTravelBudgetContext(
  scope: TrustedTravelRequestScope,
  selection: TrustedTravelSelectionContext,
  destinationCandidates: RankedDestinationCandidate[] = []
): Promise<TrustedTravelBudgetContext> {
  const budgetSummary = await scope.budget(selection)
  const buildContext = () =>
    buildItineraryTravelContext({
      selectedFlightOffer: selection.selectedFlightOffer,
      selectedHotelOffer: selection.selectedHotelOffer,
      budgetSummary,
      departureDate: scope.searchInputs.outboundDate,
      returnDate: scope.searchInputs.returnDate,
      originAirportCode: scope.searchInputs.originAirportCode,
      destinationAirportCode: scope.searchInputs.destinationAirportCode,
      travellerCount: scope.searchInputs.travellers,
      roomCount: scope.searchInputs.rooms,
      destinationCandidates,
    })
  const itineraryTravelContext = scope.timing
    ? scope.timing.measureSync('timing_calculation', buildContext)
    : buildContext()

  return { ...selection, budgetSummary, itineraryTravelContext }
}

export function buildDestinationPlanningPreview(input: {
  context: TrustedTravelBudgetContext
  destinationCandidates: RankedDestinationCandidate[]
  timing?: RequestTiming
}): ItineraryTravelContext['planningPreview'] {
  const build = () =>
    buildItineraryTravelContext({
      selectedFlightOffer: input.context.selectedFlightOffer,
      selectedHotelOffer: input.context.selectedHotelOffer,
      budgetSummary: input.context.budgetSummary,
      departureDate: input.context.searchInputs.outboundDate,
      returnDate: input.context.searchInputs.returnDate,
      originAirportCode: input.context.searchInputs.originAirportCode,
      destinationAirportCode: input.context.searchInputs.destinationAirportCode,
      travellerCount: input.context.searchInputs.travellers,
      roomCount: input.context.searchInputs.rooms,
      destinationCandidates: input.destinationCandidates,
    }).planningPreview
  return input.timing ? input.timing.measureSync('hotel_area_scoring', build) : build()
}

export const TRUSTED_TRAVEL_CACHE_POLICY = {
  fingerprintVersion: TRAVEL_SELECTION_FINGERPRINT_VERSION,
  provider: TRAVEL_SELECTION_PROVIDER,
  ttlSeconds: 15 * 60,
  maxEntries: 64,
  scope: 'instance-local',
} as const
