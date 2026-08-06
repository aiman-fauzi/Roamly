import type { FlightOption } from '@/services/travel/flights/types'
import type { HotelOption } from '@/services/travel/hotels/types'

export interface MockTripTravelSelection {
  selectedOutboundFlight: FlightOption | null
  selectedReturnFlight: FlightOption | null
  selectedHotel: HotelOption | null
  travellerCount: number
  roomCount: number
  departureDate: string
  returnDate: string
  originAirportCode: string
  destinationAirportCode: string
  travelCurrency: string
  generatedEstimateAt: string
  dataStatus: 'mock'
}

export function createMockTripTravelSelection(input: {
  selectedOutboundFlight?: FlightOption | null
  selectedReturnFlight?: FlightOption | null
  selectedHotel?: HotelOption | null
  travellerCount: number
  roomCount: number
  departureDate: string
  returnDate: string
  originAirportCode: string
  destinationAirportCode: string
  travelCurrency: string
  generatedEstimateAt?: string
}): MockTripTravelSelection {
  return {
    selectedOutboundFlight: input.selectedOutboundFlight ?? null,
    selectedReturnFlight: input.selectedReturnFlight ?? null,
    selectedHotel: input.selectedHotel ?? null,
    travellerCount: Math.max(1, input.travellerCount),
    roomCount: Math.max(1, input.roomCount),
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    originAirportCode: input.originAirportCode,
    destinationAirportCode: input.destinationAirportCode,
    travelCurrency: input.travelCurrency,
    generatedEstimateAt: input.generatedEstimateAt ?? new Date().toISOString(),
    dataStatus: 'mock',
  }
}
