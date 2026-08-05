import { generateItinerary } from '@/ai/aiService'
import { GeminiProviderError } from '@/ai/providers/GeminiProvider'
import type { GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'
import { prisma } from '@/db/client'
import type { TripTravelPlanningRequestInput } from '@/lib/validations/travelOfferValidation'
import {
  DestinationRetrievalService,
  resolveDestinationCity,
  type DestinationCityResolution,
} from '@/services/destinations/destinationRetrievalService'
import { buildGeminiDestinationContext } from '@/services/destinations/geminiContext'
import {
  attachCandidateMetadataToItinerary,
  ItineraryCandidateValidationError,
  validateItineraryCandidateContract,
} from '@/services/destinations/itineraryValidation'
import type {
  DestinationEntityType,
  DestinationRetrievalResult,
  GeminiDestinationContext,
  RankedDestinationCandidate,
} from '@/services/destinations/types'
import {
  inferDestinationCurrency,
  resolveExchangeRate,
  type ExchangeRateResult,
} from '@/services/exchangeRateService'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import { TripBudgetService, type TripBudgetInput } from '@/services/travel/budget/tripBudgetService'
import type { BudgetCategoryStatus, TripBudgetSummary } from '@/services/travel/budget/types'
import { money } from '@/services/travel/offers/money'
import {
  rankFlightOffers,
  rankHotelOffers,
  selectFlightOffer,
  selectHotelOffer,
} from '@/services/travel/offers/selection'
import { createDefaultTravelOfferService } from '@/services/travel/offers/travelOfferService'
import type {
  FlightOffer,
  FlightSearchRequest,
  FlightSearchResult,
  HotelOffer,
  HotelSearchRequest,
  HotelSearchResult,
  RankedFlightOffer,
  RankedHotelOffer,
  TravelOfferResultStatus,
  TravelOffersGeminiContext,
} from '@/services/travel/offers/types'
import { getTripById, TripStatus, updateTripStatus } from '@/services/tripService'
import type { PreferenceSet, Trip } from '@/types/trip'

export type TripTravelPlanningMode = 'preview' | 'persist'

type TravelPlanningErrorCategory =
  | TravelOfferResultStatus
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_TEMPORARY_FAILURE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_AUTHENTICATION_FAILED'
  | 'AI_UNKNOWN_FAILURE'
  | 'AI_CONTRACT_VIOLATION'
  | 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION'
  | 'INSUFFICIENT_CANDIDATES'
  | 'INVALID_SELECTION'
  | 'INCOMPLETE_LOGISTICS'

interface LoadedTrip {
  id: string
  userId: string
  title: string
  status: TripStatus
  itineraryJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

interface ProfileForPlanning {
  profileComplete: boolean
  preferredCurrency: string | null
  travelInterests: string[]
  preferredLanguage: string | null
}

interface TravelOfferSearchService {
  searchFlights(request: FlightSearchRequest, options?: { refresh?: boolean }): Promise<FlightSearchResult>
  searchHotels(request: HotelSearchRequest, options?: { refresh?: boolean }): Promise<HotelSearchResult>
}

interface TripTravelPlanningDependencies {
  getTrip?: (tripId: string, userId?: string) => Promise<LoadedTrip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  getProfile?: (userId: string) => Promise<ProfileForPlanning>
  resolveCity?: (destination: string) => Promise<DestinationCityResolution | null>
  retrieveDestinations?: (query: {
    cityId: string
    travelStyles: string[]
    interests: string[]
    budgetLevel?: string
    limitPerType: number
  }) => Promise<DestinationRetrievalResult>
  resolveExchangeRate?: (input: {
    baseCurrency: string
    quoteCurrency: string
  }) => Promise<ExchangeRateResult>
  travelOfferService?: TravelOfferSearchService
  calculateBudget?: (input: TripBudgetInput) => Promise<TripBudgetSummary>
  generateItinerary?: (request: GenerateItineraryRequest) => Promise<GenerateItineraryResponse>
  persistTrip?: (tripId: string, status: TripStatus, itineraryJson: object) => Promise<Trip>
}

interface TripTravelPlanningDependencySet {
  getTrip: (tripId: string, userId?: string) => Promise<LoadedTrip | null>
  getPreferenceSet: (tripId: string) => Promise<PreferenceSet | null>
  getProfile: (userId: string) => Promise<ProfileForPlanning>
  resolveCity: (destination: string) => Promise<DestinationCityResolution | null>
  retrieveDestinations: (query: {
    cityId: string
    travelStyles: string[]
    interests: string[]
    budgetLevel?: string
    limitPerType: number
  }) => Promise<DestinationRetrievalResult>
  resolveExchangeRate: (input: {
    baseCurrency: string
    quoteCurrency: string
  }) => Promise<ExchangeRateResult>
  travelOfferService: TravelOfferSearchService
  calculateBudget: (input: TripBudgetInput) => Promise<TripBudgetSummary>
  generateItinerary: (request: GenerateItineraryRequest) => Promise<GenerateItineraryResponse>
  persistTrip: (tripId: string, status: TripStatus, itineraryJson: object) => Promise<Trip>
}

export interface TripTravelPlanningOptions {
  tripId: string
  userId?: string
  input: TripTravelPlanningRequestInput
}

export interface TripTravelPlanningSummary {
  tripId: string
  mode: TripTravelPlanningMode
  destination: string
  cityId: string
  cityName: string
  originAirportCode: string
  destinationAirportCode: string
  departureDate: string
  returnDate: string
  checkInDate: string
  checkOutDate: string
  travelerCount: number
  rooms: number
  flightResultStatus: TravelOfferResultStatus
  hotelResultStatus: TravelOfferResultStatus
  flightOffersReturned: number
  hotelOffersReturned: number
  flightCacheStatus?: string
  hotelCacheStatus?: string
  selectedFlightOfferId?: string
  selectedHotelOfferId?: string
  flightTotal?: FlightOffer['totalPrice']
  hotelTotal?: HotelOffer['totalPrice']
  eligibleCandidates: number
  candidatesSentToGemini: number
  candidatesOmitted: number
  candidateTypeCounts: Record<DestinationEntityType, number>
  knownAttractionCost: TripBudgetSummary['attractions']['amount']
  estimatedCategories: string[]
  unknownCategories: string[]
  contingency: TripBudgetSummary['contingency']['amount']
  wholeTripTotal: TripBudgetSummary['total']['amount']
  perPersonTotal: TripBudgetSummary['total']['perPersonAmount']
  validItineraryItems: number
  validationStatus: 'PASSED' | 'FAILED' | 'NOT_RUN'
  validationIssues: string[]
  persisted: boolean
  previousItineraryPreserved: boolean
}

export interface TripTravelPlanningPreviewResult {
  trip: Trip
  flightSearch: FlightSearchResult
  hotelSearch: HotelSearchResult
  rankedFlightOffers: RankedFlightOffer[]
  rankedHotelOffers: RankedHotelOffer[]
  selectedFlightOffer: RankedFlightOffer
  selectedHotelOffer: RankedHotelOffer
  budgetSummary: TripBudgetSummary
  destinationCity: DestinationCityResolution
  destinationRetrieval: DestinationRetrievalResult
  destinationContext: GeminiDestinationContext
  travelOffersContext: TravelOffersGeminiContext
  summary: TripTravelPlanningSummary
}

export interface TripTravelPlanningResult extends TripTravelPlanningPreviewResult {
  itinerary: GenerateItineraryResponse
  request: GenerateItineraryRequest
}

interface RequiredPreferenceFields {
  destination: string
  budget: number
  durationDays: number
  groupSize: number
}

const ACTIVE_TRAVEL_PLANNING_TRIPS = new Set<string>()
const GEMINI_OFFER_LIMIT = 3

const DESTINATION_AIRPORTS: Record<string, string> = {
  'australia:melbourne': 'MEL',
  'australia:sydney': 'SYD',
  'japan:kyoto': 'KIX',
  'japan:osaka': 'KIX',
  'japan:tokyo': 'HND',
  'malaysia:kuala-lumpur': 'KUL',
  'united-kingdom:london': 'LHR',
  'united-states:los-angeles': 'LAX',
  'united-states:new-york': 'JFK',
  'united-states:san-francisco': 'SFO',
}

export class TravelPlanningError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TravelPlanningError'
  }
}

async function defaultGetTrip(tripId: string, userId?: string): Promise<LoadedTrip | null> {
  if (userId) return getTripById(tripId, userId)
  return prisma.trip.findUnique({ where: { id: tripId } })
}

async function defaultGetProfile(userId: string): Promise<ProfileForPlanning> {
  return (await getProfileSummary(userId)).profile
}

function acquirePlanningLock(tripId: string): boolean {
  if (ACTIVE_TRAVEL_PLANNING_TRIPS.has(tripId)) return false
  ACTIVE_TRAVEL_PLANNING_TRIPS.add(tripId)
  return true
}

function releasePlanningLock(tripId: string) {
  ACTIVE_TRAVEL_PLANNING_TRIPS.delete(tripId)
}

function recoverableDetails(input: {
  category: TravelPlanningErrorCategory
  previousItineraryPreserved: boolean
  retryAfterMs?: number
  details?: unknown
}) {
  return {
    recoverable: true,
    category: input.category,
    previousItineraryPreserved: input.previousItineraryPreserved,
    retryAfterMs: input.retryAfterMs,
    details: input.details,
  }
}

function offerStatusCode(status: TravelOfferResultStatus): number {
  if (status === 'RATE_LIMITED') return 429
  if (status === 'TEMPORARY_FAILURE' || status === 'PROVIDER_UNAVAILABLE') return 503
  if (status === 'INVALID_REQUEST') return 400
  if (status === 'NO_RESULTS') return 404
  return 200
}

function aiErrorStatus(error: GeminiProviderError): number {
  if (error.code === 'AI_RATE_LIMITED') return 429
  if (error.code === 'AI_TIMEOUT' || error.code === 'AI_TEMPORARY_FAILURE') return 503
  if (error.code === 'AI_INVALID_RESPONSE') return 502
  return 502
}

function requirePreferenceFields(preferences: PreferenceSet): RequiredPreferenceFields {
  const { destination, budget, durationDays, groupSize } = preferences
  if (!destination || budget == null || durationDays == null || groupSize == null) {
    throw new TravelPlanningError(
      'INCOMPLETE_PREFERENCES',
      'Destination, budget, duration, and group size are required before travel planning.',
      400
    )
  }

  return { destination, budget, durationDays, groupSize }
}

function readBudgetLevel(travelStyles: string[]): string | undefined {
  if (travelStyles.includes('luxury')) return 'luxury'
  if (travelStyles.includes('budget')) return 'budget'
  return undefined
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function inferDestinationAirport(city: DestinationCityResolution): string | undefined {
  return DESTINATION_AIRPORTS[`${city.countrySlug}:${city.slug}`]
}

function candidateTypeCounts(context: GeminiDestinationContext): Record<DestinationEntityType, number> {
  return context.candidates.reduce<Record<DestinationEntityType, number>>(
    (counts, candidate) => {
      counts[candidate.type] += 1
      return counts
    },
    { ATTRACTION: 0, RESTAURANT: 0, HOTEL: 0, ACTIVITY: 0 }
  )
}

function countItineraryItems(itinerary: GenerateItineraryResponse): number {
  return itinerary.days.reduce(
    (total, day) => total + day.morning.length + day.afternoon.length + day.evening.length,
    0
  )
}

function compactCandidateCenter(candidates: GeminiDestinationContext['candidates']):
  | { latitude: number; longitude: number }
  | undefined {
  if (candidates.length === 0) return undefined
  const total = candidates.reduce(
    (sum, candidate) => ({
      latitude: sum.latitude + candidate.latitude,
      longitude: sum.longitude + candidate.longitude,
    }),
    { latitude: 0, longitude: 0 }
  )
  return {
    latitude: Number((total.latitude / candidates.length).toFixed(6)),
    longitude: Number((total.longitude / candidates.length).toFixed(6)),
  }
}

function selectedDestinationCandidates(
  retrieval: DestinationRetrievalResult,
  context: GeminiDestinationContext
): RankedDestinationCandidate[] {
  const selectedIds = new Set(context.candidates.map((candidate) => candidate.id))
  return retrieval.candidates.filter((candidate) => selectedIds.has(candidate.candidateId))
}

function categoryNamesByStatus(summary: TripBudgetSummary, statuses: BudgetCategoryStatus[]): string[] {
  const entries = [
    ['flight', summary.flight.status],
    ['accommodation', summary.accommodation.status],
    ['attractions', summary.attractions.status],
    ['food', summary.food.status],
    ['localTransport', summary.localTransport.status],
    ['contingency', summary.contingency.status],
  ] as const

  return entries.filter(([, status]) => statuses.includes(status)).map(([name]) => name)
}

function flightOfferSummary(offer: RankedFlightOffer): string {
  const itinerary = offer.itineraries[0]
  const firstSegment = itinerary?.segments[0]
  const lastSegment = itinerary?.segments[itinerary.segments.length - 1]
  const route =
    firstSegment && lastSegment
      ? `${firstSegment.departureAirportCode}-${lastSegment.arrivalAirportCode}`
      : 'route unavailable'
  const stopLabel = itinerary?.stopCount === 0 ? 'nonstop' : `${itinerary?.stopCount ?? 0} stop`
  const refundLabel = offer.refundable ? 'refundable' : 'non-refundable'
  return `${route}, ${stopLabel}, ${itinerary?.durationMinutes ?? 0} minutes, ${offer.totalPrice.amount} ${offer.totalPrice.currency}, ${refundLabel}`
}

function uniqueRankedFlights(selected: RankedFlightOffer, ranked: RankedFlightOffer[]): RankedFlightOffer[] {
  const seen = new Set<string>()
  return [selected, ...ranked].filter((offer) => {
    if (seen.has(offer.id)) return false
    seen.add(offer.id)
    return true
  })
}

function uniqueRankedHotels(selected: RankedHotelOffer, ranked: RankedHotelOffer[]): RankedHotelOffer[] {
  const seen = new Set<string>()
  return [selected, ...ranked].filter((offer) => {
    if (seen.has(offer.id)) return false
    seen.add(offer.id)
    return true
  })
}

function buildTravelOffersContext(
  selectedFlightOffer: RankedFlightOffer,
  selectedHotelOffer: RankedHotelOffer,
  rankedFlightOffers: RankedFlightOffer[],
  rankedHotelOffers: RankedHotelOffer[]
): TravelOffersGeminiContext {
  return {
    flightOffers: uniqueRankedFlights(selectedFlightOffer, rankedFlightOffers)
      .slice(0, GEMINI_OFFER_LIMIT)
      .map((offer) => ({
        offerId: offer.id,
        summary: flightOfferSummary(offer),
        totalPrice: offer.totalPrice,
        refundable: offer.refundable,
      })),
    hotelOffers: uniqueRankedHotels(selectedHotelOffer, rankedHotelOffers)
      .slice(0, GEMINI_OFFER_LIMIT)
      .map((offer) => ({
        offerId: offer.id,
        propertyName: offer.propertyName,
        roomName: offer.roomName,
        totalPrice: offer.totalPrice,
        refundable: offer.refundable,
      })),
    selectedFlightOfferId: selectedFlightOffer.id,
    selectedHotelOfferId: selectedHotelOffer.id,
  }
}

function validateItineraryOfferContract(
  itinerary: GenerateItineraryResponse,
  context: TravelOffersGeminiContext
): string[] {
  const issues: string[] = []
  const flightOfferIds = new Set(context.flightOffers.map((offer) => offer.offerId))
  const hotelOfferIds = new Set(context.hotelOffers.map((offer) => offer.offerId))

  if (itinerary.selectedFlightOfferId) {
    if (!flightOfferIds.has(itinerary.selectedFlightOfferId)) {
      issues.push(`Itinerary references unknown flight offer ${itinerary.selectedFlightOfferId}`)
    } else if (
      context.selectedFlightOfferId &&
      itinerary.selectedFlightOfferId !== context.selectedFlightOfferId
    ) {
      issues.push(`Itinerary selected flight offer ${itinerary.selectedFlightOfferId} does not match the ranked selection`)
    }
  }

  if (itinerary.selectedHotelOfferId) {
    if (!hotelOfferIds.has(itinerary.selectedHotelOfferId)) {
      issues.push(`Itinerary references unknown hotel offer ${itinerary.selectedHotelOfferId}`)
    } else if (
      context.selectedHotelOfferId &&
      itinerary.selectedHotelOfferId !== context.selectedHotelOfferId
    ) {
      issues.push(`Itinerary selected hotel offer ${itinerary.selectedHotelOfferId} does not match the ranked selection`)
    }
  }

  return issues
}

function attachSelectedOfferIds(
  itinerary: GenerateItineraryResponse,
  context: TravelOffersGeminiContext
): GenerateItineraryResponse {
  return {
    ...itinerary,
    selectedFlightOfferId: itinerary.selectedFlightOfferId ?? context.selectedFlightOfferId,
    selectedHotelOfferId: itinerary.selectedHotelOfferId ?? context.selectedHotelOfferId,
  }
}

function previousItineraryPreserved(trip: LoadedTrip): boolean {
  return Boolean(trip.itineraryJson)
}

interface PreparedTravelPlanningContext extends TripTravelPlanningPreviewResult {
  preferences: RequiredPreferenceFields
  preferenceSet: PreferenceSet
  profile: ProfileForPlanning
  destinationCurrency: string
  exchangeRate: ExchangeRateResult
  flightRequest: FlightSearchRequest
  hotelRequest: HotelSearchRequest
}

export class TripTravelPlanningService {
  private readonly dependencies: TripTravelPlanningDependencySet

  constructor(dependencies: TripTravelPlanningDependencies = {}) {
    const resolveRate = dependencies.resolveExchangeRate ?? resolveExchangeRate
    this.dependencies = {
      getTrip: dependencies.getTrip ?? defaultGetTrip,
      getPreferenceSet: dependencies.getPreferenceSet ?? getPreferenceSet,
      getProfile: dependencies.getProfile ?? defaultGetProfile,
      resolveCity: dependencies.resolveCity ?? resolveDestinationCity,
      retrieveDestinations:
        dependencies.retrieveDestinations ??
        ((query) => new DestinationRetrievalService().retrieve(query)),
      resolveExchangeRate: resolveRate,
      travelOfferService: dependencies.travelOfferService ?? createDefaultTravelOfferService(),
      calculateBudget:
        dependencies.calculateBudget ??
        ((input) => new TripBudgetService({ resolveRate }).calculate(input)),
      generateItinerary: dependencies.generateItinerary ?? generateItinerary,
      persistTrip: dependencies.persistTrip ?? updateTripStatus,
    }
  }

  async previewBudget(options: TripTravelPlanningOptions): Promise<TripTravelPlanningPreviewResult> {
    return this.prepare(options, 'preview')
  }

  async plan(options: TripTravelPlanningOptions): Promise<TripTravelPlanningResult> {
    if (!acquirePlanningLock(options.tripId)) {
      throw new TravelPlanningError(
        'TRAVEL_PLANNING_IN_PROGRESS',
        'Travel planning is already running for this trip. Please retry shortly.',
        409,
        recoverableDetails({
          category: 'AI_TEMPORARY_FAILURE',
          previousItineraryPreserved: true,
        })
      )
    }

    try {
      const prepared = await this.prepare(options, options.input.persist ? 'persist' : 'preview')
      const request: GenerateItineraryRequest = {
        destination: prepared.preferences.destination,
        budget: prepared.preferences.budget,
        durationDays: prepared.preferences.durationDays,
        groupSize: prepared.preferences.groupSize,
        travelStyles: prepared.preferenceSet.travelStyles,
        accommodationType: prepared.preferenceSet.accommodationType,
        transportationPreference: prepared.preferenceSet.transportationPreference,
        foodPreferences: prepared.preferenceSet.foodPreferences,
        activityPreferences: prepared.preferenceSet.activityPreferences,
        userCurrency: prepared.budgetSummary.currency,
        destinationCurrency: prepared.destinationCurrency,
        exchangeRate: prepared.exchangeRate.rate,
        exchangeRateSource: prepared.exchangeRate.source,
        exchangeRateFetchedAt: prepared.exchangeRate.fetchedAt.toISOString(),
        exchangeRateFromCache: prepared.exchangeRate.fromCache,
        travelInterests: prepared.profile.travelInterests,
        preferredLanguage: prepared.profile.preferredLanguage,
        destinationContext: prepared.destinationContext,
        travelOffersContext: prepared.travelOffersContext,
        budgetSummary: prepared.budgetSummary,
      }

      let itinerary: GenerateItineraryResponse
      try {
        itinerary = await this.dependencies.generateItinerary(request)
      } catch (error) {
        if (error instanceof GeminiProviderError) {
          throw new TravelPlanningError(
            error.code,
            error.message,
            aiErrorStatus(error),
            recoverableDetails({
              category: error.code,
              previousItineraryPreserved: previousItineraryPreserved(prepared.trip),
              retryAfterMs: error.retryAfterMs,
              details: {
                ...prepared.summary,
                validationStatus: 'FAILED',
                validationIssues: [`AI provider failed before itinerary validation: ${error.code}`],
              },
            })
          )
        }
        throw error
      }

      let destinationValidationIssues: string[] = []
      try {
        validateItineraryCandidateContract(itinerary, prepared.destinationContext, {
          durationDays: prepared.preferences.durationDays,
        })
      } catch (error) {
        if (error instanceof ItineraryCandidateValidationError) {
          destinationValidationIssues = error.issues
        } else {
          throw error
        }
      }

      const offerValidationIssues = validateItineraryOfferContract(itinerary, prepared.travelOffersContext)
      const validationIssues = [...destinationValidationIssues, ...offerValidationIssues]
      if (validationIssues.length > 0) {
        throw new TravelPlanningError(
          offerValidationIssues.length > 0 ? 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION' : 'AI_CONTRACT_VIOLATION',
          offerValidationIssues.length > 0
            ? 'Generated itinerary referenced unsupported travel offers.'
            : 'Generated itinerary referenced unsupported destination records.',
          422,
          recoverableDetails({
            category:
              offerValidationIssues.length > 0
                ? 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION'
                : 'AI_CONTRACT_VIOLATION',
            previousItineraryPreserved: previousItineraryPreserved(prepared.trip),
            details: {
              ...prepared.summary,
              validationStatus: 'FAILED',
              validationIssues,
            },
          })
        )
      }

      const validatedItinerary = attachSelectedOfferIds(
        attachCandidateMetadataToItinerary(itinerary, prepared.destinationContext),
        prepared.travelOffersContext
      )
      let resultTrip: Trip = prepared.trip
      const summary: TripTravelPlanningSummary = {
        ...prepared.summary,
        validItineraryItems: countItineraryItems(validatedItinerary),
        validationStatus: 'PASSED',
        validationIssues: [],
      }

      if (options.input.persist) {
        resultTrip = await this.dependencies.persistTrip(prepared.trip.id, TripStatus.COMPLETE, validatedItinerary)
        summary.persisted = true
      }

      return {
        ...prepared,
        trip: resultTrip,
        itinerary: validatedItinerary,
        request,
        summary,
      }
    } finally {
      releasePlanningLock(options.tripId)
    }
  }

  private async prepare(
    options: TripTravelPlanningOptions,
    mode: TripTravelPlanningMode
  ): Promise<PreparedTravelPlanningContext> {
    const trip = await this.dependencies.getTrip(options.tripId, options.userId)
    if (!trip) {
      throw new TravelPlanningError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    }

    const preferenceSet = await this.dependencies.getPreferenceSet(options.tripId)
    if (!preferenceSet) {
      throw new TravelPlanningError('PREFERENCES_NOT_FOUND', 'Preferences not found.', 400)
    }

    const preferences = requirePreferenceFields(preferenceSet)
    const profile = await this.dependencies.getProfile(trip.userId)
    if (!profile.profileComplete || !profile.preferredCurrency) {
      throw new TravelPlanningError(
        'PROFILE_INCOMPLETE',
        'Please complete your profile before travel planning.',
        400
      )
    }

    const destinationCity = await this.dependencies.resolveCity(preferences.destination)
    if (!destinationCity) {
      throw new TravelPlanningError(
        'DESTINATION_CITY_NOT_FOUND',
        'Destination city is not available in the destination database.',
        400
      )
    }

    const destinationAirportCode = options.input.destinationAirportCode ?? inferDestinationAirport(destinationCity)
    if (!destinationAirportCode) {
      throw new TravelPlanningError(
        'DESTINATION_AIRPORT_REQUIRED',
        'Destination airport code is required for this city.',
        400,
        recoverableDetails({
          category: 'INCOMPLETE_LOGISTICS',
          previousItineraryPreserved: previousItineraryPreserved(trip),
        })
      )
    }

    const currency = options.input.currency ?? profile.preferredCurrency
    const travelerCount = Math.max(1, (options.input.adults ?? preferences.groupSize) + (options.input.children ?? 0))
    const rooms = options.input.rooms ?? Math.max(1, Math.ceil(travelerCount / 2))
    const checkInDate = options.input.checkInDate ?? options.input.departureDate
    const checkOutDate =
      options.input.checkOutDate ??
      options.input.returnDate ??
      addDays(options.input.departureDate, preferences.durationDays)
    const returnDate = options.input.returnDate ?? checkOutDate
    const destinationCurrency =
      destinationCity.currencyCode ?? inferDestinationCurrency(preferences.destination, currency)
    const exchangeRate = await this.dependencies.resolveExchangeRate({
      baseCurrency: destinationCurrency,
      quoteCurrency: currency,
    })

    const destinationRetrieval = await this.dependencies.retrieveDestinations({
      cityId: destinationCity.id,
      travelStyles: preferenceSet.travelStyles,
      interests: [
        ...preferenceSet.activityPreferences,
        ...preferenceSet.foodPreferences,
        ...profile.travelInterests,
      ],
      budgetLevel: readBudgetLevel(preferenceSet.travelStyles),
      limitPerType: 8,
    })
    const destinationContext = buildGeminiDestinationContext(destinationRetrieval, {
      maxCandidates: options.input.maxCandidates ?? 24,
      maxSerializedSize: 12_000,
    })

    if (destinationContext.candidates.length === 0) {
      throw new TravelPlanningError(
        'INSUFFICIENT_DESTINATION_CANDIDATES',
        'Not enough eligible destination records are available for this city yet.',
        400,
        recoverableDetails({
          category: 'INSUFFICIENT_CANDIDATES',
          previousItineraryPreserved: previousItineraryPreserved(trip),
        })
      )
    }

    const itineraryCenter = compactCandidateCenter(destinationContext.candidates)
    const flightRequest: FlightSearchRequest = {
      originAirportCode: options.input.originAirportCode,
      destinationAirportCode,
      departureDate: options.input.departureDate,
      returnDate,
      adults: options.input.adults ?? preferences.groupSize,
      children: options.input.children ?? 0,
      infants: options.input.infants ?? 0,
      cabinClass: options.input.cabinClass,
      currency,
      nonStopOnly: options.input.nonStopOnly,
      simulationMode: options.input.simulationMode,
    }
    const hotelRequest: HotelSearchRequest = {
      cityId: destinationCity.id,
      checkInDate,
      checkOutDate,
      adults: options.input.adults ?? preferences.groupSize,
      children: options.input.children ?? 0,
      rooms,
      currency,
      itineraryCenter,
      simulationMode: options.input.simulationMode,
    }
    const searchOptions = { refresh: options.input.refreshOffers }
    const [flightSearch, hotelSearch] = await Promise.all([
      this.dependencies.travelOfferService.searchFlights(flightRequest, searchOptions),
      this.dependencies.travelOfferService.searchHotels(hotelRequest, searchOptions),
    ])

    this.assertOfferSearchSucceeded('flight', flightSearch, trip)
    this.assertOfferSearchSucceeded('hotel', hotelSearch, trip)

    const rankedFlightOffers = rankFlightOffers(flightSearch.offers)
    const rankedHotelOffers = rankHotelOffers(hotelSearch.offers, 'BEST_VALUE', itineraryCenter)
    const selectedFlightOffer = selectFlightOffer(rankedFlightOffers, 'BEST_VALUE', options.input.selectedFlightOfferId)
    if (!selectedFlightOffer) {
      throw new TravelPlanningError(
        'UNKNOWN_FLIGHT_OFFER_ID',
        options.input.selectedFlightOfferId
          ? 'Selected flight offer is not available for this search.'
          : 'No flight offers are available for this search.',
        options.input.selectedFlightOfferId ? 422 : 404,
        recoverableDetails({
          category: options.input.selectedFlightOfferId ? 'INVALID_SELECTION' : 'NO_RESULTS',
          previousItineraryPreserved: previousItineraryPreserved(trip),
        })
      )
    }
    const selectedHotelOffer = selectHotelOffer(
      rankedHotelOffers,
      'BEST_VALUE',
      options.input.selectedHotelOfferId,
      itineraryCenter
    )
    if (!selectedHotelOffer) {
      throw new TravelPlanningError(
        'UNKNOWN_HOTEL_OFFER_ID',
        options.input.selectedHotelOfferId
          ? 'Selected hotel offer is not available for this search.'
          : 'No hotel offers are available for this search.',
        options.input.selectedHotelOfferId ? 422 : 404,
        recoverableDetails({
          category: options.input.selectedHotelOfferId ? 'INVALID_SELECTION' : 'NO_RESULTS',
          previousItineraryPreserved: previousItineraryPreserved(trip),
        })
      )
    }

    const budgetSummary = await this.dependencies.calculateBudget({
      currency,
      destinationCurrency,
      travelerCount,
      durationDays: preferences.durationDays,
      userBudget: money(preferences.budget, profile.preferredCurrency),
      selectedFlightOffer,
      selectedHotelOffer,
      destinationCandidates: selectedDestinationCandidates(destinationRetrieval, destinationContext),
    })
    const travelOffersContext = buildTravelOffersContext(
      selectedFlightOffer,
      selectedHotelOffer,
      rankedFlightOffers,
      rankedHotelOffers
    )
    const summary = this.buildSummary({
      trip,
      mode,
      preferences,
      destinationCity,
      flightRequest,
      hotelRequest,
      flightSearch,
      hotelSearch,
      selectedFlightOffer,
      selectedHotelOffer,
      destinationRetrieval,
      destinationContext,
      budgetSummary,
    })

    return {
      trip,
      preferences,
      preferenceSet,
      profile,
      destinationCurrency,
      exchangeRate,
      flightRequest,
      hotelRequest,
      flightSearch,
      hotelSearch,
      rankedFlightOffers,
      rankedHotelOffers,
      selectedFlightOffer,
      selectedHotelOffer,
      budgetSummary,
      destinationCity,
      destinationRetrieval,
      destinationContext,
      travelOffersContext,
      summary,
    }
  }

  private assertOfferSearchSucceeded(
    kind: 'flight' | 'hotel',
    result: FlightSearchResult | HotelSearchResult,
    trip: LoadedTrip
  ) {
    if (result.status === 'SUCCESS') return

    throw new TravelPlanningError(
      `${kind.toUpperCase()}_OFFERS_UNAVAILABLE`,
      `${kind === 'flight' ? 'Flight' : 'Hotel'} offers are unavailable for this search.`,
      offerStatusCode(result.status),
      recoverableDetails({
        category: result.status,
        previousItineraryPreserved: previousItineraryPreserved(trip),
        details: {
          provider: result.provider,
          status: result.status,
          cacheStatus: result.cacheStatus,
          fetchedAt: result.fetchedAt,
          expiresAt: result.expiresAt,
          warning: result.warning,
        },
      })
    )
  }

  private buildSummary(input: {
    trip: LoadedTrip
    mode: TripTravelPlanningMode
    preferences: RequiredPreferenceFields
    destinationCity: DestinationCityResolution
    flightRequest: FlightSearchRequest
    hotelRequest: HotelSearchRequest
    flightSearch: FlightSearchResult
    hotelSearch: HotelSearchResult
    selectedFlightOffer: RankedFlightOffer
    selectedHotelOffer: RankedHotelOffer
    destinationRetrieval: DestinationRetrievalResult
    destinationContext: GeminiDestinationContext
    budgetSummary: TripBudgetSummary
  }): TripTravelPlanningSummary {
    return {
      tripId: input.trip.id,
      mode: input.mode,
      destination: input.preferences.destination,
      cityId: input.destinationCity.id,
      cityName: input.destinationCity.name,
      originAirportCode: input.flightRequest.originAirportCode,
      destinationAirportCode: input.flightRequest.destinationAirportCode,
      departureDate: input.flightRequest.departureDate,
      returnDate: input.flightRequest.returnDate ?? input.hotelRequest.checkOutDate,
      checkInDate: input.hotelRequest.checkInDate,
      checkOutDate: input.hotelRequest.checkOutDate,
      travelerCount: input.flightRequest.adults + (input.flightRequest.children ?? 0),
      rooms: input.hotelRequest.rooms,
      flightResultStatus: input.flightSearch.status,
      hotelResultStatus: input.hotelSearch.status,
      flightOffersReturned: input.flightSearch.offers.length,
      hotelOffersReturned: input.hotelSearch.offers.length,
      flightCacheStatus: input.flightSearch.cacheStatus,
      hotelCacheStatus: input.hotelSearch.cacheStatus,
      selectedFlightOfferId: input.selectedFlightOffer.id,
      selectedHotelOfferId: input.selectedHotelOffer.id,
      flightTotal: input.selectedFlightOffer.totalPrice,
      hotelTotal: input.selectedHotelOffer.totalPrice,
      eligibleCandidates: input.destinationRetrieval.candidates.length,
      candidatesSentToGemini: input.destinationContext.candidates.length,
      candidatesOmitted: input.destinationContext.omittedCandidateCount,
      candidateTypeCounts: candidateTypeCounts(input.destinationContext),
      knownAttractionCost: input.budgetSummary.attractions.amount,
      estimatedCategories: categoryNamesByStatus(input.budgetSummary, ['ESTIMATED']),
      unknownCategories: categoryNamesByStatus(input.budgetSummary, ['UNKNOWN', 'PARTIAL']),
      contingency: input.budgetSummary.contingency.amount,
      wholeTripTotal: input.budgetSummary.total.amount,
      perPersonTotal: input.budgetSummary.total.perPersonAmount,
      validItineraryItems: 0,
      validationStatus: 'NOT_RUN',
      validationIssues: [],
      persisted: false,
      previousItineraryPreserved: previousItineraryPreserved(input.trip),
    }
  }
}
