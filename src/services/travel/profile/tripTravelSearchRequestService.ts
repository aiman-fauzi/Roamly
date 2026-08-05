import type { TripTravelProfile } from '@prisma/client'

import { prisma } from '@/db/client'
import type { PersistedTripTravelPlanningRequestInput } from '@/lib/validations/travelOfferValidation'
import {
  resolveDestinationCity,
  type DestinationCityResolution,
} from '@/services/destinations/destinationRetrievalService'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import type { FlightSearchRequest, HotelSearchRequest } from '@/services/travel/offers/types'
import { dateToDateOnly } from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import type { PreferenceSet, Trip } from '@/types/trip'

interface LoadedTrip {
  id: string
  userId: string
  title: string
  status: Trip['status']
  itineraryJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

interface TripTravelSearchRequestDependencies {
  db?: typeof prisma
  getTrip?: (tripId: string, userId?: string) => Promise<LoadedTrip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  getPreferredCurrency?: (userId: string) => Promise<string | null>
  resolveCity?: (destination: string) => Promise<DestinationCityResolution | null>
}

export interface TripTravelSearchRequests {
  travelProfile: TripTravelProfile
  destinationCity: DestinationCityResolution
  flightRequest: FlightSearchRequest
  hotelRequest: HotelSearchRequest
}

export class TripTravelSearchRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TripTravelSearchRequestError'
  }
}

async function defaultGetPreferredCurrency(userId: string): Promise<string | null> {
  return (await getProfileSummary(userId)).profile.preferredCurrency
}

function requireValue(value: string | null | undefined, field: string): string {
  if (value) return value
  throw new TripTravelSearchRequestError(
    'TRAVEL_PROFILE_INCOMPLETE',
    'Travel profile is missing fields required for offer search.',
    400,
    { missingRequiredFields: [field] }
  )
}

function requireDate(value: Date | null | undefined, field: string): string {
  return requireValue(dateToDateOnly(value), field)
}

export class TripTravelSearchRequestService {
  private readonly db: typeof prisma
  private readonly getTrip: NonNullable<TripTravelSearchRequestDependencies['getTrip']>
  private readonly getPreferenceSet: NonNullable<TripTravelSearchRequestDependencies['getPreferenceSet']>
  private readonly getPreferredCurrency: NonNullable<TripTravelSearchRequestDependencies['getPreferredCurrency']>
  private readonly resolveCity: NonNullable<TripTravelSearchRequestDependencies['resolveCity']>

  constructor(dependencies: TripTravelSearchRequestDependencies = {}) {
    this.db = dependencies.db ?? prisma
    this.getTrip = dependencies.getTrip ?? ((tripId, userId) => (userId ? getTripById(tripId, userId) : prisma.trip.findUnique({ where: { id: tripId } })))
    this.getPreferenceSet = dependencies.getPreferenceSet ?? getPreferenceSet
    this.getPreferredCurrency = dependencies.getPreferredCurrency ?? defaultGetPreferredCurrency
    this.resolveCity = dependencies.resolveCity ?? resolveDestinationCity
  }

  async build(input: {
    tripId: string
    userId?: string
    overrides?: PersistedTripTravelPlanningRequestInput
  }): Promise<TripTravelSearchRequests> {
    const trip = await this.getTrip(input.tripId, input.userId)
    if (!trip) throw new TripTravelSearchRequestError('TRIP_NOT_FOUND', 'Trip not found.', 404)

    const [preferences, travelProfile, preferredCurrency] = await Promise.all([
      this.getPreferenceSet(input.tripId),
      this.db.tripTravelProfile.findUnique({ where: { tripId: input.tripId } }),
      this.getPreferredCurrency(trip.userId),
    ])
    if (!preferences?.destination) {
      throw new TripTravelSearchRequestError('PREFERENCES_NOT_FOUND', 'Trip destination preferences are missing.', 400)
    }
    if (!travelProfile) {
      throw new TripTravelSearchRequestError('TRAVEL_PROFILE_NOT_FOUND', 'Travel profile is required before offer search.', 400)
    }

    const destinationCity = await this.resolveCity(preferences.destination)
    if (!destinationCity) {
      throw new TripTravelSearchRequestError('DESTINATION_CITY_NOT_FOUND', 'Destination city is not available.', 400)
    }

    const overrides = input.overrides ?? {}
    const departureDate = overrides.departureDate ?? requireDate(travelProfile.departureDate, 'departureDate')
    const returnDate = overrides.returnDate ?? requireDate(travelProfile.returnDate, 'returnDate')
    const adults = overrides.adults ?? travelProfile.adults
    const children = overrides.children ?? travelProfile.children
    const currency = overrides.currency ?? travelProfile.currency ?? preferredCurrency

    const flightRequest: FlightSearchRequest = {
      originAirportCode: overrides.originAirportCode ?? requireValue(travelProfile.originAirportCode, 'originAirportCode'),
      destinationAirportCode:
        overrides.destinationAirportCode ?? requireValue(travelProfile.destinationAirportCode, 'destinationAirportCode'),
      departureDate,
      returnDate,
      adults,
      children,
      infants: overrides.infants ?? travelProfile.infants,
      cabinClass: overrides.cabinClass ?? travelProfile.cabinClass,
      currency: requireValue(currency, 'currency'),
      nonStopOnly: overrides.nonStopOnly ?? travelProfile.nonStopOnly,
      simulationMode: overrides.simulationMode,
    }
    const hotelRequest: HotelSearchRequest = {
      cityId: destinationCity.id,
      checkInDate: overrides.checkInDate ?? departureDate,
      checkOutDate: overrides.checkOutDate ?? returnDate,
      adults,
      children,
      rooms: overrides.rooms ?? travelProfile.rooms,
      currency: flightRequest.currency,
      simulationMode: overrides.simulationMode,
    }

    return {
      travelProfile,
      destinationCity,
      flightRequest,
      hotelRequest,
    }
  }
}
