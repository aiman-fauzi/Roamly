import { MockFlightOfferProvider, MockHotelOfferProvider } from '@/services/travel/offers/mockProviders'
import { buildOfferSearchFingerprint, InMemoryOfferCache } from '@/services/travel/offers/offerCache'
import type {
  FlightOfferProvider,
  FlightSearchRequest,
  FlightSearchResult,
  HotelOfferProvider,
  HotelSearchRequest,
  HotelSearchResult,
} from '@/services/travel/offers/types'

export interface TravelOfferServiceOptions {
  flightProvider?: FlightOfferProvider
  hotelProvider?: HotelOfferProvider
  flightCache?: InMemoryOfferCache<FlightSearchResult>
  hotelCache?: InMemoryOfferCache<HotelSearchResult>
  flightTtlSeconds?: number
  hotelTtlSeconds?: number
  maxPayloadBytes?: number
  now?: () => Date
}

export interface SearchOptions {
  refresh?: boolean
}

const DEFAULT_FLIGHT_TTL_SECONDS = 15 * 60
const DEFAULT_HOTEL_TTL_SECONDS = 15 * 60
const DEFAULT_MAX_PAYLOAD_BYTES = 256_000
let defaultTravelOfferService: TravelOfferService | null = null

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function flightFingerprint(provider: string, request: FlightSearchRequest): string {
  return buildOfferSearchFingerprint({
    kind: 'flight',
    provider,
    originAirportCode: request.originAirportCode,
    destinationAirportCode: request.destinationAirportCode,
    departureDate: request.departureDate,
    returnDate: request.returnDate,
    adults: request.adults,
    children: request.children ?? 0,
    infants: request.infants ?? 0,
    cabinClass: request.cabinClass ?? 'ECONOMY',
    currency: request.currency,
    nonStopOnly: Boolean(request.nonStopOnly),
    simulationMode: request.simulationMode ?? 'NORMAL',
  })
}

function hotelFingerprint(provider: string, request: HotelSearchRequest): string {
  return buildOfferSearchFingerprint({
    kind: 'hotel',
    provider,
    cityId: request.cityId,
    checkInDate: request.checkInDate,
    checkOutDate: request.checkOutDate,
    adults: request.adults,
    children: request.children ?? 0,
    rooms: request.rooms,
    currency: request.currency,
    itineraryCenter: request.itineraryCenter
      ? {
          latitude: Number(request.itineraryCenter.latitude.toFixed(6)),
          longitude: Number(request.itineraryCenter.longitude.toFixed(6)),
        }
      : undefined,
    simulationMode: request.simulationMode ?? 'NORMAL',
  })
}

export class TravelOfferService {
  private readonly flightProvider: FlightOfferProvider
  private readonly hotelProvider: HotelOfferProvider
  private readonly flightCache: InMemoryOfferCache<FlightSearchResult>
  private readonly hotelCache: InMemoryOfferCache<HotelSearchResult>
  private readonly flightTtlSeconds: number
  private readonly hotelTtlSeconds: number
  private readonly maxPayloadBytes: number
  private readonly now: () => Date

  constructor(options: TravelOfferServiceOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.flightProvider = options.flightProvider ?? new MockFlightOfferProvider(this.now)
    this.hotelProvider = options.hotelProvider ?? new MockHotelOfferProvider(this.now)
    this.flightCache = options.flightCache ?? new InMemoryOfferCache()
    this.hotelCache = options.hotelCache ?? new InMemoryOfferCache()
    this.flightTtlSeconds =
      options.flightTtlSeconds ??
      readPositiveInteger(process.env.FLIGHT_OFFER_CACHE_TTL_SECONDS, DEFAULT_FLIGHT_TTL_SECONDS)
    this.hotelTtlSeconds =
      options.hotelTtlSeconds ??
      readPositiveInteger(process.env.HOTEL_OFFER_CACHE_TTL_SECONDS, DEFAULT_HOTEL_TTL_SECONDS)
    this.maxPayloadBytes =
      options.maxPayloadBytes ??
      readPositiveInteger(process.env.TRAVEL_OFFER_CACHE_MAX_PAYLOAD_BYTES, DEFAULT_MAX_PAYLOAD_BYTES)
  }

  async searchFlights(request: FlightSearchRequest, options: SearchOptions = {}): Promise<FlightSearchResult> {
    const key = flightFingerprint(this.flightProvider.providerKey, request)
    const cached = await this.flightCache.getOrSet(
      key,
      () => this.flightProvider.searchFlights(request),
      {
        ttlSeconds: this.flightTtlSeconds,
        now: this.now(),
        refresh: options.refresh,
        maxPayloadBytes: this.maxPayloadBytes,
      }
    )

    return {
      ...cached.value,
      cacheStatus: cached.cacheStatus,
      requestFingerprint: key,
      expiresAt: cached.value.expiresAt ?? cached.expiresAt.toISOString(),
    }
  }

  async searchHotels(request: HotelSearchRequest, options: SearchOptions = {}): Promise<HotelSearchResult> {
    const key = hotelFingerprint(this.hotelProvider.providerKey, request)
    const cached = await this.hotelCache.getOrSet(
      key,
      () => this.hotelProvider.searchHotels(request),
      {
        ttlSeconds: this.hotelTtlSeconds,
        now: this.now(),
        refresh: options.refresh,
        maxPayloadBytes: this.maxPayloadBytes,
      }
    )

    return {
      ...cached.value,
      cacheStatus: cached.cacheStatus,
      requestFingerprint: key,
      expiresAt: cached.value.expiresAt ?? cached.expiresAt.toISOString(),
    }
  }
}

export function createDefaultTravelOfferService(): TravelOfferService {
  const mode = process.env.TRAVEL_OFFER_MODE ?? 'mock'
  const flightProvider = process.env.FLIGHT_PROVIDER ?? 'mock'
  const hotelProvider = process.env.HOTEL_PROVIDER ?? 'mock'
  if (mode !== 'mock' || flightProvider !== 'mock' || hotelProvider !== 'mock') {
    throw new Error('Only mock travel offer providers are configured in this build.')
  }

  defaultTravelOfferService ??= new TravelOfferService()
  return defaultTravelOfferService
}
