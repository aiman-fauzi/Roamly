import { FlightSearchService } from '@/services/travel/flights/flightSearchService'
import type { FlightCabinClass, FlightOption } from '@/services/travel/flights/types'
import { HotelSearchService } from '@/services/travel/hotels/hotelSearchService'
import type { HotelOption } from '@/services/travel/hotels/types'
import { money } from '@/services/travel/offers/money'
import { buildOfferSearchFingerprint } from '@/services/travel/offers/offerCache'
import type {
  BaggageAllowance,
  CabinClass,
  FlightItinerary,
  FlightOffer,
  FlightOfferProvider,
  FlightSearchRequest,
  FlightSearchResult,
  FlightSegment,
  HotelOffer,
  HotelOfferProvider,
  HotelSearchRequest,
  HotelSearchResult,
  TravelOfferResultStatus,
  TravelOfferSimulationMode,
} from '@/services/travel/offers/types'

const MOCK_PROVIDER = 'mock'
const DEFAULT_TTL_MS = 15 * 60 * 1000
const MOCK_DESTINATION = 'Phu Quoc'

function resultBase(
  mode: TravelOfferSimulationMode | undefined,
  fetchedAt: Date
): {
  status: TravelOfferResultStatus
  provider: string
  fetchedAt: string
  expiresAt: string
  warning?: string
} {
  const expiresAt = new Date(fetchedAt.getTime() + DEFAULT_TTL_MS).toISOString()
  if (mode === 'EMPTY') {
    return {
      status: 'NO_RESULTS',
      provider: MOCK_PROVIDER,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt,
    }
  }
  if (mode === 'RATE_LIMITED') {
    return {
      status: 'RATE_LIMITED',
      provider: MOCK_PROVIDER,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt,
      warning: 'Mock provider simulated rate limiting.',
    }
  }
  if (mode === 'TEMPORARY_FAILURE') {
    return {
      status: 'TEMPORARY_FAILURE',
      provider: MOCK_PROVIDER,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt,
      warning: 'Mock provider simulated a temporary failure.',
    }
  }
  return {
    status: 'SUCCESS',
    provider: MOCK_PROVIDER,
    fetchedAt: fetchedAt.toISOString(),
    expiresAt,
  }
}

function legacyCabinClass(value: CabinClass | undefined): FlightCabinClass {
  if (value === 'BUSINESS' || value === 'FIRST') return 'business'
  if (value === 'PREMIUM_ECONOMY') return 'premium_economy'
  return 'economy'
}

function moneyFromNumber(amount: number, currency: string) {
  return money(amount.toFixed(2), currency)
}

function flightSegment(option: FlightOption): FlightSegment {
  return {
    departureAirportCode: option.originAirportCode,
    arrivalAirportCode: option.destinationAirportCode,
    departureAt: option.departureAt,
    arrivalAt: option.arrivalAt,
    carrierCode: option.airlineCode,
    flightNumber: option.flightNumber,
    durationMinutes: option.durationMinutes,
  }
}

function flightItinerary(option: FlightOption): FlightItinerary {
  return {
    segments: [flightSegment(option)],
    durationMinutes: option.durationMinutes,
    stopCount: option.stops,
  }
}

function baggageSummary(option: FlightOption): BaggageAllowance {
  return {
    cabinBags: option.baggage.cabinKg == null ? undefined : 1,
    checkedBags: option.baggage.checkedKg == null ? undefined : 1,
    notes: `${option.baggage.cabinKg ?? '-'}kg cabin, ${option.baggage.checkedKg ?? '-'}kg checked sample allowance.`,
  }
}

function pairId(outbound: FlightOption, returnFlight: FlightOption): string {
  const suffix = buildOfferSearchFingerprint({
    outbound: outbound.id,
    return: returnFlight.id,
  }).slice(0, 10)
  return `flight-${outbound.id}-${returnFlight.id}-${suffix}`
}

function hotelId(option: HotelOption): string {
  return `hotel-${option.id}`
}

function travellers(request: FlightSearchRequest | HotelSearchRequest): number {
  return Math.max(1, request.adults + (request.children ?? 0))
}

export class MockFlightOfferProvider implements FlightOfferProvider {
  readonly providerKey = MOCK_PROVIDER

  constructor(
    private readonly now: () => Date = () => new Date('2026-08-05T00:00:00.000Z'),
    private readonly flightSearchService = new FlightSearchService()
  ) {}

  async searchFlights(request: FlightSearchRequest): Promise<FlightSearchResult> {
    const fetchedAt = this.now()
    const base = resultBase(request.simulationMode, fetchedAt)
    if (base.status !== 'SUCCESS') return { ...base, offers: [] }

    const search = await this.flightSearchService.search({
      destination: MOCK_DESTINATION,
      originAirportCode: request.originAirportCode,
      destinationAirportCode: request.destinationAirportCode,
      departureDate: request.departureDate,
      returnDate: request.returnDate ?? request.departureDate,
      travellers: travellers(request),
      cabinClass: legacyCabinClass(request.cabinClass),
      currency: request.currency,
    })

    const offers: FlightOffer[] = search.outboundOptions.flatMap((outbound) =>
      search.returnOptions.map((returnFlight) => {
        const total = outbound.fare.totalAmount + returnFlight.fare.totalAmount
        const baseAmount = outbound.fare.baseAmount + returnFlight.fare.baseAmount
        const taxesAmount = outbound.fare.taxesAmount + returnFlight.fare.taxesAmount
        const id = pairId(outbound, returnFlight)

        return {
          id,
          provider: this.providerKey,
          providerOfferId: `mock-${id}`,
          itineraries: [flightItinerary(outbound), flightItinerary(returnFlight)],
          totalPrice: moneyFromNumber(total, request.currency),
          basePrice: moneyFromNumber(baseAmount, request.currency),
          taxes: moneyFromNumber(taxesAmount, request.currency),
          baggage: baggageSummary(outbound),
          refundable: outbound.refundable && returnFlight.refundable,
          fetchedAt: base.fetchedAt,
          expiresAt: base.expiresAt,
          dataStatus: 'mock',
          availabilityStatus: 'simulated',
          mockFlightPair: {
            outboundFlightId: outbound.id,
            returnFlightId: returnFlight.id,
            outbound,
            return: returnFlight,
          },
        }
      })
    )

    return {
      ...base,
      status: offers.length > 0 ? 'SUCCESS' : 'NO_RESULTS',
      offers,
    }
  }
}

export class MockHotelOfferProvider implements HotelOfferProvider {
  readonly providerKey = MOCK_PROVIDER

  constructor(
    private readonly now: () => Date = () => new Date('2026-08-05T00:00:00.000Z'),
    private readonly hotelSearchService = new HotelSearchService()
  ) {}

  async searchHotels(request: HotelSearchRequest): Promise<HotelSearchResult> {
    const fetchedAt = this.now()
    const base = resultBase(request.simulationMode, fetchedAt)
    if (base.status !== 'SUCCESS') return { ...base, offers: [] }

    const search = await this.hotelSearchService.search({
      destination: MOCK_DESTINATION,
      checkInDate: request.checkInDate,
      checkOutDate: request.checkOutDate,
      travellers: travellers(request),
      rooms: request.rooms,
      currency: request.currency,
    })

    const capacityRequired = travellers(request)
    const offers: HotelOffer[] = search.options
      .filter((option) => option.maxGuests * request.rooms >= capacityRequired)
      .map((option) => ({
        id: hotelId(option),
        provider: this.providerKey,
        propertyId: option.id,
        propertyName: option.name,
        coordinates: {
          latitude: option.latitude,
          longitude: option.longitude,
        },
        roomName: option.roomType,
        boardType: option.breakfastIncluded ? 'BREAKFAST' : 'ROOM_ONLY',
        refundable: option.refundable,
        totalPrice: moneyFromNumber(option.pricing.totalAmount, request.currency),
        taxes: moneyFromNumber(option.pricing.taxesAmount, request.currency),
        fetchedAt: base.fetchedAt,
        expiresAt: base.expiresAt,
        dataStatus: 'mock',
        availabilityStatus: 'simulated',
        mockHotel: {
          hotelId: option.id,
          area: option.area,
          nights: option.nights,
          rooms: request.rooms,
          option,
        },
      }))

    return {
      ...base,
      status: offers.length > 0 ? 'SUCCESS' : 'NO_RESULTS',
      offers,
    }
  }
}
