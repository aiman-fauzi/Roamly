import type { GeminiDestinationContext } from '@/services/destinations/types'
import type { ExchangeRateResult } from '@/services/exchangeRateService'
import type {
  FlightOption,
  MockAvailabilityStatus,
  MockTravelDataStatus,
} from '@/services/travel/flights/types'
import type { HotelOption, PhuQuocHotelArea } from '@/services/travel/hotels/types'

export type TravelOfferResultStatus =
  | 'SUCCESS'
  | 'NO_RESULTS'
  | 'RATE_LIMITED'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'

export type TravelOfferCacheStatus = 'MISS' | 'HIT' | 'REFRESHED'

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'

export interface Money {
  amount: string
  currency: string
}

export interface ConvertedMoney {
  original: Money
  converted: Money
  exchangeRate: ExchangeRateResult
}

export interface FlightSearchRequest {
  originAirportCode: string
  destinationAirportCode: string
  departureDate: string
  returnDate?: string
  adults: number
  children?: number
  infants?: number
  cabinClass?: CabinClass
  currency: string
  nonStopOnly?: boolean
  simulationMode?: TravelOfferSimulationMode
}

export interface FlightSegment {
  departureAirportCode: string
  arrivalAirportCode: string
  departureAt: string
  arrivalAt: string
  carrierCode: string
  flightNumber: string
  durationMinutes: number
}

export interface FlightItinerary {
  segments: FlightSegment[]
  durationMinutes: number
  stopCount: number
}

export interface BaggageAllowance {
  checkedBags?: number
  cabinBags?: number
  notes?: string
}

export interface FlightOffer {
  id: string
  provider: string
  providerOfferId: string
  itineraries: FlightItinerary[]
  totalPrice: Money
  basePrice?: Money
  taxes?: Money
  baggage?: BaggageAllowance
  refundable?: boolean
  bookingUrl?: string
  fetchedAt: string
  expiresAt?: string
  dataStatus?: MockTravelDataStatus
  availabilityStatus?: MockAvailabilityStatus
  mockFlightPair?: {
    outboundFlightId: string
    returnFlightId: string
    outbound: FlightOption
    return: FlightOption
  }
}

export interface HotelSearchRequest {
  cityId: string
  checkInDate: string
  checkOutDate: string
  adults: number
  children?: number
  rooms: number
  currency: string
  itineraryCenter?: {
    latitude: number
    longitude: number
  }
  simulationMode?: TravelOfferSimulationMode
}

export interface HotelOffer {
  id: string
  provider: string
  propertyId: string
  propertyName: string
  coordinates?: {
    latitude: number
    longitude: number
  }
  roomName?: string
  boardType?: string
  refundable?: boolean
  totalPrice: Money
  taxes?: Money
  bookingUrl?: string
  fetchedAt: string
  expiresAt?: string
  distanceFromItineraryCenterKm?: number
  dataStatus?: MockTravelDataStatus
  availabilityStatus?: MockAvailabilityStatus
  mockHotel?: {
    hotelId: string
    area: PhuQuocHotelArea
    nights: number
    rooms: number
    option: HotelOption
  }
}

export type TravelOfferSimulationMode = 'NORMAL' | 'EMPTY' | 'RATE_LIMITED' | 'TEMPORARY_FAILURE'

export interface TravelOfferResultBase {
  status: TravelOfferResultStatus
  provider: string
  fetchedAt: string
  expiresAt?: string
  cacheStatus?: TravelOfferCacheStatus
  requestFingerprint?: string
  warning?: string
}

export interface FlightSearchResult extends TravelOfferResultBase {
  offers: FlightOffer[]
}

export interface HotelSearchResult extends TravelOfferResultBase {
  offers: HotelOffer[]
}

export interface FlightOfferProvider {
  providerKey: string
  searchFlights(request: FlightSearchRequest): Promise<FlightSearchResult>
}

export interface HotelOfferProvider {
  providerKey: string
  searchHotels(request: HotelSearchRequest): Promise<HotelSearchResult>
}

export type FlightOfferSelectionStrategy = 'CHEAPEST' | 'SHORTEST' | 'FEWEST_STOPS' | 'BEST_VALUE'

export type HotelOfferSelectionStrategy =
  | 'CHEAPEST'
  | 'REFUNDABLE'
  | 'NEAREST_TO_ITINERARY'
  | 'BEST_VALUE'

export interface RankedFlightOffer extends FlightOffer {
  rankScore: number
  rankReasons: string[]
}

export interface RankedHotelOffer extends HotelOffer {
  rankScore: number
  rankReasons: string[]
}

export interface TravelOffersGeminiContext {
  flightOffers: Array<{
    offerId: string
    summary: string
    totalPrice: Money
    refundable?: boolean
  }>
  hotelOffers: Array<{
    offerId: string
    propertyName: string
    roomName?: string
    totalPrice: Money
    refundable?: boolean
  }>
  selectedFlightOfferId?: string
  selectedHotelOfferId?: string
}

export interface TravelPlanningGeminiContext {
  trip: {
    originAirportCode: string
    destinationAirportCode: string
    departureDate: string
    returnDate?: string
    adults: number
    children: number
    rooms: number
    currency: string
  }
  travelOffers: TravelOffersGeminiContext
  destinationCandidates: GeminiDestinationContext
  budgetSummary: unknown
}
