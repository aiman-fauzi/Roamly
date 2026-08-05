import type {
  Prisma,
  TripFlightSelection,
  TripHotelSelection,
  TripOfferSelectionSource,
  TripOfferSelectionStatus,
  TripTravelProfile,
} from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

import { prisma } from '@/db/client'
import {
  resolveDestinationCity,
  type DestinationCityResolution,
} from '@/services/destinations/destinationRetrievalService'
import { resolveExchangeRate, type ExchangeRateResult } from '@/services/exchangeRateService'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import { convertMoney } from '@/services/travel/offers/money'
import { createDefaultTravelOfferService } from '@/services/travel/offers/travelOfferService'
import type {
  FlightOffer,
  FlightSearchRequest,
  FlightSearchResult,
  HotelOffer,
  HotelSearchRequest,
  HotelSearchResult,
  Money,
  TravelOfferSimulationMode,
} from '@/services/travel/offers/types'
import { dateToDateOnly } from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import type { PreferenceSet, Trip } from '@/types/trip'

export type SelectionSource = 'USER_SELECTED' | 'SYSTEM_RECOMMENDED' | 'NOT_SELECTED'

interface LoadedTrip {
  id: string
  userId: string
  title: string
  status: Trip['status']
  itineraryJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

interface TravelOfferSearchService {
  searchFlights(request: FlightSearchRequest, options?: { refresh?: boolean }): Promise<FlightSearchResult>
  searchHotels(request: HotelSearchRequest, options?: { refresh?: boolean }): Promise<HotelSearchResult>
}

interface TripOfferSelectionDependencies {
  db?: typeof prisma
  getTrip?: (tripId: string, userId?: string) => Promise<LoadedTrip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  getPreferredCurrency?: (userId: string) => Promise<string | null>
  resolveCity?: (destination: string) => Promise<DestinationCityResolution | null>
  travelOfferService?: TravelOfferSearchService
  resolveExchangeRate?: (input: { baseCurrency: string; quoteCurrency: string }) => Promise<ExchangeRateResult>
  now?: () => Date
}

interface SelectionContext {
  trip: LoadedTrip
  preferences: PreferenceSet
  travelProfile: TripTravelProfile
  destinationCity: DestinationCityResolution
  currency: string
}

export interface FlightSelectionResponse {
  id: string
  tripId: string
  offerId: string
  providerKey: string
  providerOfferId: string
  searchFingerprint: string
  originAirportCode: string
  destinationAirportCode: string
  departureDate: string
  returnDate?: string
  itinerarySummary: unknown
  originalPrice: Money
  convertedPrice?: Money
  conversionRate?: number
  conversionTimestamp?: string
  baggageSummary?: unknown
  refundable?: boolean
  fetchedAt: string
  providerExpiresAt?: string
  selectedAt: string
  status: TripOfferSelectionStatus
  selectionSource: TripOfferSelectionSource
  isExpired: boolean
  requiresRefresh: boolean
}

export interface HotelSelectionResponse {
  id: string
  tripId: string
  offerId: string
  providerKey: string
  providerOfferId: string
  searchFingerprint: string
  propertyId: string
  propertyName: string
  coordinates?: unknown
  checkInDate: string
  checkOutDate: string
  roomSummary?: unknown
  boardType?: string
  originalPrice: Money
  convertedPrice?: Money
  conversionRate?: number
  conversionTimestamp?: string
  refundable?: boolean
  fetchedAt: string
  providerExpiresAt?: string
  selectedAt: string
  status: TripOfferSelectionStatus
  selectionSource: TripOfferSelectionSource
  isExpired: boolean
  requiresRefresh: boolean
}

export interface TripSelectionsResponse {
  flightSelection: FlightSelectionResponse | null
  hotelSelection: HotelSelectionResponse | null
  historicalSelectionCounts: {
    flights: number
    hotels: number
  }
}

export class TripOfferSelectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TripOfferSelectionError'
  }
}

async function defaultGetPreferredCurrency(userId: string): Promise<string | null> {
  return (await getProfileSummary(userId)).profile.preferredCurrency
}

function decimalMoney(amount: unknown, currency: string): Money {
  const value =
    amount instanceof Decimal
      ? amount.toFixed(2)
      : amount && typeof amount === 'object' && 'toFixed' in amount
        ? (amount as { toFixed: (places: number) => string }).toFixed(2)
        : Number(amount).toFixed(2)
  return { amount: value, currency }
}

function decimalNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  if (value instanceof Decimal) return value.toNumber()
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false
  const value = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  return value <= now
}

function requireDateOnly(date: Date | null | undefined, field: string): string {
  const value = dateToDateOnly(date)
  if (!value) {
    throw new TripOfferSelectionError(
      'TRAVEL_PROFILE_INCOMPLETE',
      'Travel profile is missing fields required for offer selection.',
      400,
      { missingRequiredFields: [field] }
    )
  }
  return value
}

function requireString(value: string | null | undefined, field: string): string {
  if (!value) {
    throw new TripOfferSelectionError(
      'TRAVEL_PROFILE_INCOMPLETE',
      'Travel profile is missing fields required for offer selection.',
      400,
      { missingRequiredFields: [field] }
    )
  }
  return value
}

function offerExpiryGuard(offer: FlightOffer | HotelOffer, now: Date) {
  if (isExpired(offer.expiresAt, now)) {
    throw new TripOfferSelectionError(
      'OFFER_EXPIRED',
      'Selected offer has expired. Refresh offers before selecting it.',
      409,
      { offerId: offer.id, expiresAt: offer.expiresAt }
    )
  }
}

function resultExpiryGuard(result: FlightSearchResult | HotelSearchResult, now: Date) {
  if (isExpired(result.expiresAt, now)) {
    throw new TripOfferSelectionError(
      'OFFER_SEARCH_EXPIRED',
      'Offer search results have expired. Refresh offers before selecting.',
      409,
      { requestFingerprint: result.requestFingerprint, expiresAt: result.expiresAt }
    )
  }
}

function flightItinerarySummary(offer: FlightOffer) {
  return offer.itineraries.map((itinerary) => ({
    durationMinutes: itinerary.durationMinutes,
    stopCount: itinerary.stopCount,
    segments: itinerary.segments.map((segment) => ({
      departureAirportCode: segment.departureAirportCode,
      arrivalAirportCode: segment.arrivalAirportCode,
      departureAt: segment.departureAt,
      arrivalAt: segment.arrivalAt,
      carrierCode: segment.carrierCode,
      flightNumber: segment.flightNumber,
      durationMinutes: segment.durationMinutes,
    })),
  }))
}

function hotelRoomSummary(offer: HotelOffer) {
  return {
    roomName: offer.roomName,
    boardType: offer.boardType,
    distanceFromItineraryCenterKm: offer.distanceFromItineraryCenterKm,
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function serializeFlightSelection(selection: TripFlightSelection, now = new Date()): FlightSelectionResponse {
  const expired = selection.status === 'EXPIRED' || isExpired(selection.providerExpiresAt, now)
  return {
    id: selection.id,
    tripId: selection.tripId,
    offerId: selection.offerId,
    providerKey: selection.providerKey,
    providerOfferId: selection.providerOfferId,
    searchFingerprint: selection.searchFingerprint,
    originAirportCode: selection.originAirportCode,
    destinationAirportCode: selection.destinationAirportCode,
    departureDate: dateToDateOnly(selection.departureDate)!,
    returnDate: dateToDateOnly(selection.returnDate),
    itinerarySummary: selection.itinerarySummary,
    originalPrice: decimalMoney(selection.originalAmount, selection.originalCurrency),
    convertedPrice:
      selection.convertedAmount && selection.convertedCurrency
        ? decimalMoney(selection.convertedAmount, selection.convertedCurrency)
        : undefined,
    conversionRate: decimalNumber(selection.conversionRate),
    conversionTimestamp: selection.conversionTimestamp?.toISOString(),
    baggageSummary: selection.baggageSummary ?? undefined,
    refundable: selection.refundable ?? undefined,
    fetchedAt: selection.fetchedAt.toISOString(),
    providerExpiresAt: selection.providerExpiresAt?.toISOString(),
    selectedAt: selection.selectedAt.toISOString(),
    status: selection.status,
    selectionSource: selection.selectionSource,
    isExpired: expired,
    requiresRefresh: expired || selection.status !== 'SELECTED',
  }
}

export function serializeHotelSelection(selection: TripHotelSelection, now = new Date()): HotelSelectionResponse {
  const expired = selection.status === 'EXPIRED' || isExpired(selection.providerExpiresAt, now)
  return {
    id: selection.id,
    tripId: selection.tripId,
    offerId: selection.offerId,
    providerKey: selection.providerKey,
    providerOfferId: selection.providerOfferId,
    searchFingerprint: selection.searchFingerprint,
    propertyId: selection.propertyId,
    propertyName: selection.propertyName,
    coordinates: selection.coordinates ?? undefined,
    checkInDate: dateToDateOnly(selection.checkInDate)!,
    checkOutDate: dateToDateOnly(selection.checkOutDate)!,
    roomSummary: selection.roomSummary ?? undefined,
    boardType: selection.boardType ?? undefined,
    originalPrice: decimalMoney(selection.originalAmount, selection.originalCurrency),
    convertedPrice:
      selection.convertedAmount && selection.convertedCurrency
        ? decimalMoney(selection.convertedAmount, selection.convertedCurrency)
        : undefined,
    conversionRate: decimalNumber(selection.conversionRate),
    conversionTimestamp: selection.conversionTimestamp?.toISOString(),
    refundable: selection.refundable ?? undefined,
    fetchedAt: selection.fetchedAt.toISOString(),
    providerExpiresAt: selection.providerExpiresAt?.toISOString(),
    selectedAt: selection.selectedAt.toISOString(),
    status: selection.status,
    selectionSource: selection.selectionSource,
    isExpired: expired,
    requiresRefresh: expired || selection.status !== 'SELECTED',
  }
}

export class TripOfferSelectionService {
  private readonly db: typeof prisma
  private readonly getTrip: NonNullable<TripOfferSelectionDependencies['getTrip']>
  private readonly getPreferenceSet: NonNullable<TripOfferSelectionDependencies['getPreferenceSet']>
  private readonly getPreferredCurrency: NonNullable<TripOfferSelectionDependencies['getPreferredCurrency']>
  private readonly resolveCity: NonNullable<TripOfferSelectionDependencies['resolveCity']>
  private readonly travelOfferService: TravelOfferSearchService
  private readonly resolveRate: NonNullable<TripOfferSelectionDependencies['resolveExchangeRate']>
  private readonly now: () => Date

  constructor(dependencies: TripOfferSelectionDependencies = {}) {
    this.db = dependencies.db ?? prisma
    this.getTrip = dependencies.getTrip ?? ((tripId, userId) => (userId ? getTripById(tripId, userId) : prisma.trip.findUnique({ where: { id: tripId } })))
    this.getPreferenceSet = dependencies.getPreferenceSet ?? getPreferenceSet
    this.getPreferredCurrency = dependencies.getPreferredCurrency ?? defaultGetPreferredCurrency
    this.resolveCity = dependencies.resolveCity ?? resolveDestinationCity
    this.travelOfferService = dependencies.travelOfferService ?? createDefaultTravelOfferService()
    this.resolveRate = dependencies.resolveExchangeRate ?? resolveExchangeRate
    this.now = dependencies.now ?? (() => new Date())
  }

  async getSelections(input: { tripId: string; userId?: string }): Promise<TripSelectionsResponse> {
    await this.requireTrip(input.tripId, input.userId)
    await this.markExpiredSelections(input.tripId)
    const [flightSelection, hotelSelection, flightCount, hotelCount] = await Promise.all([
      this.db.tripFlightSelection.findFirst({
        where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
        orderBy: { selectedAt: 'desc' },
      }),
      this.db.tripHotelSelection.findFirst({
        where: { tripId: input.tripId, status: 'SELECTED' as TripOfferSelectionStatus },
        orderBy: { selectedAt: 'desc' },
      }),
      this.db.tripFlightSelection.count({ where: { tripId: input.tripId } }),
      this.db.tripHotelSelection.count({ where: { tripId: input.tripId } }),
    ])

    return {
      flightSelection: flightSelection ? serializeFlightSelection(flightSelection, this.now()) : null,
      hotelSelection: hotelSelection ? serializeHotelSelection(hotelSelection, this.now()) : null,
      historicalSelectionCounts: { flights: flightCount, hotels: hotelCount },
    }
  }

  async selectFlight(input: {
    tripId: string
    userId?: string
    offerId: string
    simulationMode?: TravelOfferSimulationMode
    refreshOffers?: boolean
  }): Promise<FlightSelectionResponse> {
    const context = await this.loadContext(input.tripId, input.userId)
    const request = this.flightRequest(context, input.simulationMode)
    const result = await this.travelOfferService.searchFlights(request, { refresh: input.refreshOffers })
    if (result.status !== 'SUCCESS') {
      throw new TripOfferSelectionError(
        'FLIGHT_OFFERS_UNAVAILABLE',
        'Flight offers are unavailable for this trip profile.',
        result.status === 'RATE_LIMITED' ? 429 : 503,
        { status: result.status, provider: result.provider }
      )
    }
    resultExpiryGuard(result, this.now())

    const offer = result.offers.find((candidate) => candidate.id === input.offerId)
    if (!offer) {
      throw new TripOfferSelectionError(
        'UNKNOWN_FLIGHT_OFFER_ID',
        'Selected flight offer is not available for this trip search.',
        422,
        { requestFingerprint: result.requestFingerprint }
      )
    }
    offerExpiryGuard(offer, this.now())

    const converted = await this.convertOfferPrice(offer.totalPrice, context.currency)
    const selected = await this.db.$transaction(async (tx) => {
      const existing = await tx.tripFlightSelection.findFirst({
        where: {
          tripId: context.trip.id,
          status: 'SELECTED' as TripOfferSelectionStatus,
          providerKey: offer.provider,
          providerOfferId: offer.providerOfferId,
          searchFingerprint: result.requestFingerprint!,
        },
      })
      if (existing) return existing

      await tx.tripFlightSelection.updateMany({
        where: { tripId: context.trip.id, status: 'SELECTED' as TripOfferSelectionStatus },
        data: { status: 'REPLACED' as TripOfferSelectionStatus },
      })
      await tx.tripBudgetSnapshot.updateMany({
        where: { tripId: context.trip.id, status: 'CURRENT' },
        data: { status: 'STALE' },
      })
      return tx.tripFlightSelection.create({
        data: {
          tripId: context.trip.id,
          offerId: offer.id,
          providerKey: offer.provider,
          providerOfferId: offer.providerOfferId,
          searchFingerprint: result.requestFingerprint!,
          originAirportCode: request.originAirportCode,
          destinationAirportCode: request.destinationAirportCode,
          departureDate: new Date(`${request.departureDate}T00:00:00.000Z`),
          returnDate: request.returnDate ? new Date(`${request.returnDate}T00:00:00.000Z`) : undefined,
          itinerarySummary: toJson(flightItinerarySummary(offer))!,
          originalAmount: new Decimal(offer.totalPrice.amount),
          originalCurrency: offer.totalPrice.currency,
          convertedAmount: new Decimal(converted.converted.amount),
          convertedCurrency: converted.converted.currency,
          conversionRate: new Decimal(converted.exchangeRate.rate),
          conversionTimestamp: converted.exchangeRate.fetchedAt,
          baggageSummary: toJson(offer.baggage),
          refundable: offer.refundable,
          fetchedAt: new Date(offer.fetchedAt),
          providerExpiresAt: offer.expiresAt ? new Date(offer.expiresAt) : undefined,
          selectionSource: 'USER_SELECTED' as TripOfferSelectionSource,
        },
      })
    })

    return serializeFlightSelection(selected, this.now())
  }

  async selectHotel(input: {
    tripId: string
    userId?: string
    offerId: string
    simulationMode?: TravelOfferSimulationMode
    refreshOffers?: boolean
  }): Promise<HotelSelectionResponse> {
    const context = await this.loadContext(input.tripId, input.userId)
    const request = this.hotelRequest(context, input.simulationMode)
    const result = await this.travelOfferService.searchHotels(request, { refresh: input.refreshOffers })
    if (result.status !== 'SUCCESS') {
      throw new TripOfferSelectionError(
        'HOTEL_OFFERS_UNAVAILABLE',
        'Hotel offers are unavailable for this trip profile.',
        result.status === 'RATE_LIMITED' ? 429 : 503,
        { status: result.status, provider: result.provider }
      )
    }
    resultExpiryGuard(result, this.now())

    const offer = result.offers.find((candidate) => candidate.id === input.offerId)
    if (!offer) {
      throw new TripOfferSelectionError(
        'UNKNOWN_HOTEL_OFFER_ID',
        'Selected hotel offer is not available for this trip search.',
        422,
        { requestFingerprint: result.requestFingerprint }
      )
    }
    offerExpiryGuard(offer, this.now())

    const converted = await this.convertOfferPrice(offer.totalPrice, context.currency)
    const selected = await this.db.$transaction(async (tx) => {
      const existing = await tx.tripHotelSelection.findFirst({
        where: {
          tripId: context.trip.id,
          status: 'SELECTED' as TripOfferSelectionStatus,
          providerKey: offer.provider,
          providerOfferId: offer.id,
          searchFingerprint: result.requestFingerprint!,
        },
      })
      if (existing) return existing

      await tx.tripHotelSelection.updateMany({
        where: { tripId: context.trip.id, status: 'SELECTED' as TripOfferSelectionStatus },
        data: { status: 'REPLACED' as TripOfferSelectionStatus },
      })
      await tx.tripBudgetSnapshot.updateMany({
        where: { tripId: context.trip.id, status: 'CURRENT' },
        data: { status: 'STALE' },
      })
      return tx.tripHotelSelection.create({
        data: {
          tripId: context.trip.id,
          offerId: offer.id,
          providerKey: offer.provider,
          providerOfferId: offer.id,
          searchFingerprint: result.requestFingerprint!,
          propertyId: offer.propertyId,
          propertyName: offer.propertyName,
          coordinates: toJson(offer.coordinates),
          checkInDate: new Date(`${request.checkInDate}T00:00:00.000Z`),
          checkOutDate: new Date(`${request.checkOutDate}T00:00:00.000Z`),
          roomSummary: toJson(hotelRoomSummary(offer)),
          boardType: offer.boardType,
          originalAmount: new Decimal(offer.totalPrice.amount),
          originalCurrency: offer.totalPrice.currency,
          convertedAmount: new Decimal(converted.converted.amount),
          convertedCurrency: converted.converted.currency,
          conversionRate: new Decimal(converted.exchangeRate.rate),
          conversionTimestamp: converted.exchangeRate.fetchedAt,
          refundable: offer.refundable,
          fetchedAt: new Date(offer.fetchedAt),
          providerExpiresAt: offer.expiresAt ? new Date(offer.expiresAt) : undefined,
          selectionSource: 'USER_SELECTED' as TripOfferSelectionSource,
        },
      })
    })

    return serializeHotelSelection(selected, this.now())
  }

  private async requireTrip(tripId: string, userId?: string): Promise<LoadedTrip> {
    const trip = await this.getTrip(tripId, userId)
    if (!trip) throw new TripOfferSelectionError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    return trip
  }

  private async loadContext(tripId: string, userId?: string): Promise<SelectionContext> {
    const trip = await this.requireTrip(tripId, userId)
    const [preferences, travelProfile, preferredCurrency] = await Promise.all([
      this.getPreferenceSet(tripId),
      this.db.tripTravelProfile.findUnique({ where: { tripId } }),
      this.getPreferredCurrency(trip.userId),
    ])
    if (!preferences?.destination) {
      throw new TripOfferSelectionError('PREFERENCES_NOT_FOUND', 'Trip destination preferences are missing.', 400)
    }
    if (!travelProfile) {
      throw new TripOfferSelectionError('TRAVEL_PROFILE_NOT_FOUND', 'Travel profile is required before selecting offers.', 400)
    }
    const destinationCity = await this.resolveCity(preferences.destination)
    if (!destinationCity) {
      throw new TripOfferSelectionError('DESTINATION_CITY_NOT_FOUND', 'Destination city is not available.', 400)
    }

    return {
      trip,
      preferences,
      travelProfile,
      destinationCity,
      currency: requireString(travelProfile.currency ?? preferredCurrency, 'currency'),
    }
  }

  private flightRequest(context: SelectionContext, simulationMode?: TravelOfferSimulationMode): FlightSearchRequest {
    const profile = context.travelProfile
    return {
      originAirportCode: requireString(profile.originAirportCode, 'originAirportCode'),
      destinationAirportCode: requireString(profile.destinationAirportCode, 'destinationAirportCode'),
      departureDate: requireDateOnly(profile.departureDate, 'departureDate'),
      returnDate: requireDateOnly(profile.returnDate, 'returnDate'),
      adults: profile.adults,
      children: profile.children,
      infants: profile.infants,
      cabinClass: profile.cabinClass,
      currency: context.currency,
      nonStopOnly: profile.nonStopOnly,
      simulationMode,
    }
  }

  private hotelRequest(context: SelectionContext, simulationMode?: TravelOfferSimulationMode): HotelSearchRequest {
    const profile = context.travelProfile
    return {
      cityId: context.destinationCity.id,
      checkInDate: requireDateOnly(profile.departureDate, 'departureDate'),
      checkOutDate: requireDateOnly(profile.returnDate, 'returnDate'),
      adults: profile.adults,
      children: profile.children,
      rooms: profile.rooms,
      currency: context.currency,
      simulationMode,
    }
  }

  private async convertOfferPrice(value: Money, targetCurrency: string) {
    const rate =
      value.currency === targetCurrency
        ? {
            baseCurrency: value.currency,
            quoteCurrency: targetCurrency,
            rate: 1,
            source: 'same_currency',
            fetchedAt: this.now(),
            fromCache: false,
          }
        : await this.resolveRate({ baseCurrency: value.currency, quoteCurrency: targetCurrency })
    return convertMoney(value, rate)
  }

  private async markExpiredSelections(tripId: string) {
    const now = this.now()
    await this.db.$transaction(async (tx) => {
      const [flights, hotels] = await Promise.all([
        tx.tripFlightSelection.updateMany({
          where: {
            tripId,
            status: 'SELECTED' as TripOfferSelectionStatus,
            providerExpiresAt: { lte: now },
          },
          data: { status: 'EXPIRED' as TripOfferSelectionStatus },
        }),
        tx.tripHotelSelection.updateMany({
          where: {
            tripId,
            status: 'SELECTED' as TripOfferSelectionStatus,
            providerExpiresAt: { lte: now },
          },
          data: { status: 'EXPIRED' as TripOfferSelectionStatus },
        }),
      ])
      if (flights.count > 0 || hotels.count > 0) {
        await tx.tripBudgetSnapshot.updateMany({
          where: { tripId, status: 'CURRENT' },
          data: { status: 'STALE' },
        })
      }
    })
  }
}
