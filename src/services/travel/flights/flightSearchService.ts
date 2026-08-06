import type { FlightProvider } from './flightProvider'
import { MockFlightProvider } from './mockFlightProvider'
import type { FlightSearchInput, FlightSearchResult } from './types'

export class FlightSearchService {
  constructor(private readonly provider: FlightProvider = new MockFlightProvider()) {}

  async search(input: FlightSearchInput): Promise<FlightSearchResult> {
    return this.provider.searchFlights(input)
  }
}
