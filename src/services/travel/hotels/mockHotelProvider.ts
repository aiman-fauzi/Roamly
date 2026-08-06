import type { HotelProvider } from './hotelProvider'
import type { HotelOption, HotelSearchInput, HotelSearchResult } from './types'

import {
  createDeterministicRandom,
  deterministicSeed,
} from '@/services/travel/mock/deterministicSeed'
import { PHU_QUOC_MOCK_HOTELS } from '@/services/travel/mock/phuQuocMockFixtures'

function nightsBetween(checkInDate: string, checkOutDate: string): number {
  const checkIn = new Date(`${checkInDate}T00:00:00.000Z`).getTime()
  const checkOut = new Date(`${checkOutDate}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round((checkOut - checkIn) / 86_400_000))
}

export class MockHotelProvider implements HotelProvider {
  readonly providerKey = 'mock'

  async searchHotels(input: HotelSearchInput): Promise<HotelSearchResult> {
    const seedInput = {
      destination: input.destination,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      travellers: input.travellers,
      rooms: input.rooms,
      currency: input.currency,
    }
    const random = createDeterministicRandom(seedInput)
    const seed = deterministicSeed(seedInput)
    const nights = nightsBetween(input.checkInDate, input.checkOutDate)
    const options: HotelOption[] = PHU_QUOC_MOCK_HOTELS.map((fixture) => {
      const nightlyAmount = Math.max(90, fixture.nightlyAmount + random.int(-15, 18))
      const roomMultiplier = Math.max(1, input.rooms)
      const staySubtotalAmount = nightlyAmount * nights * roomMultiplier
      const taxesAmount = Math.round(staySubtotalAmount * 0.12)
      return {
        id: `mock-${fixture.id}-${seed.toString(16).slice(0, 8)}`,
        provider: 'mock',
        name: fixture.name,
        area: fixture.area,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        starRating: fixture.starRating,
        guestRating: null,
        roomType: fixture.roomType,
        maxGuests: fixture.maxGuests,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights,
        roomCount: roomMultiplier,
        pricing: {
          nightlyAmount,
          staySubtotalAmount,
          taxesAmount,
          totalAmount: staySubtotalAmount + taxesAmount,
          currency: input.currency,
        },
        breakfastIncluded: fixture.breakfastIncluded,
        refundable: fixture.refundable,
        cancellationSummary: fixture.cancellationSummary,
        amenities: fixture.amenities,
        dataStatus: 'mock',
        availabilityStatus: 'simulated',
      }
    })

    return {
      provider: 'mock',
      dataStatus: 'mock',
      availabilityStatus: 'simulated',
      seed,
      options: options.sort(
        (first, second) => first.pricing.totalAmount - second.pricing.totalAmount
      ),
    }
  }
}
