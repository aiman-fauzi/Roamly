import type { HotelProvider } from './hotelProvider'
import { MockHotelProvider } from './mockHotelProvider'
import type { HotelSearchInput, HotelSearchResult } from './types'

export class HotelSearchService {
  constructor(private readonly provider: HotelProvider = new MockHotelProvider()) {}

  async search(input: HotelSearchInput): Promise<HotelSearchResult> {
    return this.provider.searchHotels(input)
  }
}
