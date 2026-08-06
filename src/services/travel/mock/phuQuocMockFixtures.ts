import type { FlightDirection } from '@/services/travel/flights/types'
import type { PhuQuocHotelArea } from '@/services/travel/hotels/types'

export const PHU_QUOC_AIRPORTS = {
  KUL: 'Kuala Lumpur International Airport',
  PQC: 'Phu Quoc International Airport',
} as const

export interface MockFlightFixture {
  id: string
  direction: FlightDirection
  departureHour: number
  departureMinute: number
  durationMinutes: number
  airlineCode: string
  airlineName: string
  flightNumberSeed: number
  baseFare: number
  refundable: boolean
  changeable: boolean
}

export const PHU_QUOC_MOCK_FLIGHTS: MockFlightFixture[] = [
  {
    id: 'morning-outbound',
    direction: 'outbound',
    departureHour: 8,
    departureMinute: 35,
    durationMinutes: 105,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 180,
    baseFare: 260,
    refundable: false,
    changeable: true,
  },
  {
    id: 'afternoon-outbound',
    direction: 'outbound',
    departureHour: 14,
    departureMinute: 15,
    durationMinutes: 110,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 280,
    baseFare: 230,
    refundable: false,
    changeable: true,
  },
  {
    id: 'evening-outbound',
    direction: 'outbound',
    departureHour: 19,
    departureMinute: 20,
    durationMinutes: 110,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 380,
    baseFare: 210,
    refundable: true,
    changeable: true,
  },
  {
    id: 'morning-return',
    direction: 'return',
    departureHour: 9,
    departureMinute: 10,
    durationMinutes: 105,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 480,
    baseFare: 225,
    refundable: false,
    changeable: true,
  },
  {
    id: 'afternoon-return',
    direction: 'return',
    departureHour: 15,
    departureMinute: 40,
    durationMinutes: 110,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 580,
    baseFare: 245,
    refundable: false,
    changeable: true,
  },
  {
    id: 'evening-return',
    direction: 'return',
    departureHour: 20,
    departureMinute: 5,
    durationMinutes: 110,
    airlineCode: 'RM',
    airlineName: 'Roamly Air',
    flightNumberSeed: 680,
    baseFare: 275,
    refundable: true,
    changeable: true,
  },
]

export interface MockHotelFixture {
  id: string
  name: string
  area: PhuQuocHotelArea
  latitude: number
  longitude: number
  starRating: number | null
  roomType: string
  maxGuests: number
  nightlyAmount: number
  breakfastIncluded: boolean
  refundable: boolean
  cancellationSummary: string
  amenities: string[]
}

export const PHU_QUOC_MOCK_HOTELS: MockHotelFixture[] = [
  {
    id: 'duong-dong-central',
    name: 'Duong Dong Central Hotel',
    area: 'duong_dong',
    latitude: 10.2169,
    longitude: 103.9592,
    starRating: 3,
    roomType: 'City View Room',
    maxGuests: 2,
    nightlyAmount: 145,
    breakfastIncluded: true,
    refundable: true,
    cancellationSummary: 'Simulated flexible cancellation until 3 days before check-in.',
    amenities: ['breakfast', 'pool', 'central area'],
  },
  {
    id: 'long-beach-resort',
    name: 'Roamly Long Beach Resort',
    area: 'long_beach',
    latitude: 10.175,
    longitude: 103.965,
    starRating: 4,
    roomType: 'Garden Balcony Room',
    maxGuests: 3,
    nightlyAmount: 210,
    breakfastIncluded: true,
    refundable: true,
    cancellationSummary: 'Simulated partial refund after confirmation.',
    amenities: ['breakfast', 'beach access', 'pool'],
  },
  {
    id: 'sunset-bay-suites',
    name: 'Sunset Bay Suites',
    area: 'south_phu_quoc',
    latitude: 10.0285,
    longitude: 104.004,
    starRating: 4,
    roomType: 'Sunset Studio',
    maxGuests: 2,
    nightlyAmount: 235,
    breakfastIncluded: false,
    refundable: false,
    cancellationSummary: 'Simulated non-refundable sample rate.',
    amenities: ['kitchenette', 'south island', 'sea view'],
  },
  {
    id: 'north-island-family',
    name: 'North Island Family Resort',
    area: 'north_phu_quoc',
    latitude: 10.336,
    longitude: 103.879,
    starRating: 4,
    roomType: 'Family Suite',
    maxGuests: 4,
    nightlyAmount: 255,
    breakfastIncluded: true,
    refundable: true,
    cancellationSummary: 'Simulated flexible family rate.',
    amenities: ['breakfast', 'kids club', 'family pool'],
  },
]

export const MOCK_TRAVEL_NOTICE =
  'Sample travel options - live price and availability are not connected.'
