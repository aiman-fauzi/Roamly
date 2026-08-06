import type { HotelSearchInput, HotelSearchResult } from './types'

export interface HotelProvider {
  providerKey: string
  searchHotels(input: HotelSearchInput): Promise<HotelSearchResult>
}
