export type MockHotelProviderKey = 'mock'
export type MockTravelDataStatus = 'mock'
export type MockAvailabilityStatus = 'simulated'
export type PhuQuocHotelArea = 'duong_dong' | 'long_beach' | 'south_phu_quoc' | 'north_phu_quoc'

export interface HotelSearchInput {
  destination: string
  checkInDate: string
  checkOutDate: string
  travellers: number
  rooms: number
  currency: string
}

export interface HotelOption {
  id: string
  provider: MockHotelProviderKey
  name: string
  area: PhuQuocHotelArea
  latitude: number
  longitude: number
  starRating: number | null
  guestRating: null
  roomType: string
  maxGuests: number
  checkInDate: string
  checkOutDate: string
  nights: number
  roomCount: number
  pricing: {
    nightlyAmount: number
    staySubtotalAmount: number
    taxesAmount: number
    totalAmount: number
    currency: string
  }
  breakfastIncluded: boolean
  refundable: boolean
  cancellationSummary: string
  amenities: string[]
  dataStatus: MockTravelDataStatus
  availabilityStatus: MockAvailabilityStatus
}

export interface HotelSearchResult {
  provider: MockHotelProviderKey
  dataStatus: MockTravelDataStatus
  availabilityStatus: MockAvailabilityStatus
  seed: number
  options: HotelOption[]
}
