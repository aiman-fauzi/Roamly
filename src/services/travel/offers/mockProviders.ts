import { money } from '@/services/travel/offers/money'
import { buildOfferSearchFingerprint } from '@/services/travel/offers/offerCache'
import type {
  FlightOffer,
  FlightOfferProvider,
  FlightSearchRequest,
  FlightSearchResult,
  HotelOffer,
  HotelOfferProvider,
  HotelSearchRequest,
  HotelSearchResult,
  TravelOfferResultStatus,
  TravelOfferSimulationMode,
} from '@/services/travel/offers/types'

const MOCK_PROVIDER = 'mock'
const DEFAULT_TTL_MS = 15 * 60 * 1000

function addHours(date: string, hours: number): string {
  const value = new Date(`${date}T08:00:00.000Z`)
  value.setUTCHours(value.getUTCHours() + hours)
  return value.toISOString()
}

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
    return { status: 'NO_RESULTS', provider: MOCK_PROVIDER, fetchedAt: fetchedAt.toISOString(), expiresAt }
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
  return { status: 'SUCCESS', provider: MOCK_PROVIDER, fetchedAt: fetchedAt.toISOString(), expiresAt }
}

function stableSuffix(input: unknown): string {
  return buildOfferSearchFingerprint(input).slice(0, 10)
}

function cabinMultiplier(cabinClass = 'ECONOMY'): number {
  if (cabinClass === 'FIRST') return 4
  if (cabinClass === 'BUSINESS') return 2.5
  if (cabinClass === 'PREMIUM_ECONOMY') return 1.6
  return 1
}

export class MockFlightOfferProvider implements FlightOfferProvider {
  readonly providerKey = MOCK_PROVIDER

  constructor(private readonly now: () => Date = () => new Date('2026-08-05T00:00:00.000Z')) {}

  async searchFlights(request: FlightSearchRequest): Promise<FlightSearchResult> {
    const fetchedAt = this.now()
    const base = resultBase(request.simulationMode, fetchedAt)
    if (base.status !== 'SUCCESS') return { ...base, offers: [] }

    const travelers = request.adults + (request.children ?? 0)
    const multiplier = cabinMultiplier(request.cabinClass)
    const directPrice = (travelers * 420 * multiplier).toFixed(2)
    const connectingPrice = (travelers * 330 * multiplier).toFixed(2)
    const suffix = stableSuffix(request)
    const outboundDirect = {
      departureAirportCode: request.originAirportCode,
      arrivalAirportCode: request.destinationAirportCode,
      departureAt: addHours(request.departureDate, 1),
      arrivalAt: addHours(request.departureDate, 3),
      carrierCode: 'RM',
      flightNumber: '101',
      durationMinutes: 120,
    }
    const offers: FlightOffer[] = [
      {
        id: `flight-${suffix}-direct`,
        provider: this.providerKey,
        providerOfferId: `mock-flight-direct-${suffix}`,
        itineraries: [{ segments: [outboundDirect], durationMinutes: 120, stopCount: 0 }],
        totalPrice: money(directPrice, request.currency),
        basePrice: money((Number(directPrice) * 0.82).toFixed(2), request.currency),
        taxes: money((Number(directPrice) * 0.18).toFixed(2), request.currency),
        baggage: { checkedBags: 1, cabinBags: 1 },
        refundable: false,
        fetchedAt: base.fetchedAt,
        expiresAt: base.expiresAt,
      },
    ]

    if (!request.nonStopOnly) {
      offers.push({
        id: `flight-${suffix}-connect`,
        provider: this.providerKey,
        providerOfferId: `mock-flight-connect-${suffix}`,
        itineraries: [
          {
            segments: [
              {
                departureAirportCode: request.originAirportCode,
                arrivalAirportCode: 'SIN',
                departureAt: addHours(request.departureDate, 2),
                arrivalAt: addHours(request.departureDate, 3),
                carrierCode: 'RM',
                flightNumber: '201',
                durationMinutes: 60,
              },
              {
                departureAirportCode: 'SIN',
                arrivalAirportCode: request.destinationAirportCode,
                departureAt: addHours(request.departureDate, 5),
                arrivalAt: addHours(request.departureDate, 6),
                carrierCode: 'RM',
                flightNumber: '202',
                durationMinutes: 60,
              },
            ],
            durationMinutes: 240,
            stopCount: 1,
          },
        ],
        totalPrice: money(connectingPrice, request.currency),
        basePrice: money((Number(connectingPrice) * 0.8).toFixed(2), request.currency),
        taxes: money((Number(connectingPrice) * 0.2).toFixed(2), request.currency),
        baggage: { checkedBags: 1, cabinBags: 1, notes: 'Connection through mock hub.' },
        refundable: true,
        fetchedAt: base.fetchedAt,
        expiresAt: base.expiresAt,
      })
    }

    return { ...base, offers }
  }
}

function nightsBetween(checkInDate: string, checkOutDate: string): number {
  const checkIn = new Date(`${checkInDate}T00:00:00.000Z`).getTime()
  const checkOut = new Date(`${checkOutDate}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round((checkOut - checkIn) / 86_400_000))
}

export class MockHotelOfferProvider implements HotelOfferProvider {
  readonly providerKey = MOCK_PROVIDER

  constructor(private readonly now: () => Date = () => new Date('2026-08-05T00:00:00.000Z')) {}

  async searchHotels(request: HotelSearchRequest): Promise<HotelSearchResult> {
    const fetchedAt = this.now()
    const base = resultBase(request.simulationMode, fetchedAt)
    if (base.status !== 'SUCCESS') return { ...base, offers: [] }

    const nights = nightsBetween(request.checkInDate, request.checkOutDate)
    const suffix = stableSuffix(request)
    const roomFactor = Math.max(1, request.rooms)
    const offers: HotelOffer[] = [
      {
        id: `hotel-${suffix}-value`,
        provider: this.providerKey,
        propertyId: `mock-property-value-${suffix}`,
        propertyName: 'Mock Central Stay',
        coordinates: { latitude: 3.145, longitude: 101.695 },
        roomName: 'Standard Room',
        boardType: 'ROOM_ONLY',
        refundable: false,
        totalPrice: money((nights * roomFactor * 180).toFixed(2), request.currency),
        taxes: money((nights * roomFactor * 18).toFixed(2), request.currency),
        fetchedAt: base.fetchedAt,
        expiresAt: base.expiresAt,
      },
      {
        id: `hotel-${suffix}-flex`,
        provider: this.providerKey,
        propertyId: `mock-property-flex-${suffix}`,
        propertyName: 'Mock Flexible Suites',
        coordinates: { latitude: 3.151, longitude: 101.708 },
        roomName: 'Deluxe Room',
        boardType: 'BREAKFAST',
        refundable: true,
        totalPrice: money((nights * roomFactor * 260).toFixed(2), request.currency),
        taxes: money((nights * roomFactor * 26).toFixed(2), request.currency),
        fetchedAt: base.fetchedAt,
        expiresAt: base.expiresAt,
      },
    ]

    return { ...base, offers }
  }
}
