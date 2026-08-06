import type { FlightSearchInput, FlightSearchResult } from './types'

export interface FlightProvider {
  providerKey: string
  searchFlights(input: FlightSearchInput): Promise<FlightSearchResult>
}
