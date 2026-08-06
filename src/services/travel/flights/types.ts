export type MockFlightProviderKey = 'mock'
export type FlightCabinClass = 'economy' | 'premium_economy' | 'business'
export type MockTravelDataStatus = 'mock'
export type MockAvailabilityStatus = 'simulated'
export type FlightDirection = 'outbound' | 'return'

export interface FlightSearchInput {
  destination: string
  originAirportCode: string
  destinationAirportCode: string
  departureDate: string
  returnDate: string
  travellers: number
  cabinClass: FlightCabinClass
  currency: string
}

export interface FlightOption {
  id: string
  provider: MockFlightProviderKey
  direction: FlightDirection
  airlineCode: string
  airlineName: string
  flightNumber: string
  originAirportCode: string
  originAirportName: string
  destinationAirportCode: string
  destinationAirportName: string
  departureAt: string
  arrivalAt: string
  durationMinutes: number
  stops: number
  cabinClass: FlightCabinClass
  travellerCount: number
  baggage: {
    cabinKg: number | null
    checkedKg: number | null
  }
  fare: {
    perTravellerBaseAmount: number
    perTravellerTaxesAmount: number
    perTravellerTotalAmount: number
    baseAmount: number
    taxesAmount: number
    totalAmount: number
    currency: string
  }
  refundable: boolean
  changeable: boolean
  dataStatus: MockTravelDataStatus
  availabilityStatus: MockAvailabilityStatus
}

export interface FlightSearchResult {
  provider: MockFlightProviderKey
  dataStatus: MockTravelDataStatus
  availabilityStatus: MockAvailabilityStatus
  seed: number
  outboundOptions: FlightOption[]
  returnOptions: FlightOption[]
}
