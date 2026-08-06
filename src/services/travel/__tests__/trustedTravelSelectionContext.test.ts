import { describe, expect, it, vi } from 'vitest'

import { TripBudgetService } from '@/services/travel/budget/tripBudgetService'
import {
  MockFlightOfferProvider,
  MockHotelOfferProvider,
} from '@/services/travel/offers/mockProviders'
import {
  buildTrustedTravelBudgetContext,
  buildTrustedTravelSelectionContext,
  TrustedTravelRequestScope,
} from '@/services/travel/planning/trustedTravelSelectionContext'

const now = () => new Date('2026-08-06T00:00:00.000Z')
const searchInputs = {
  originAirportCode: 'KUL',
  destinationAirportCode: 'PQC',
  outboundDate: '2026-09-12',
  returnDate: '2026-09-15',
  travellers: 2,
  rooms: 1,
  cabinClass: 'ECONOMY' as const,
  currency: 'MYR',
}

async function fixtures() {
  const flightSearch = await new MockFlightOfferProvider(now).searchFlights({
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    adults: 2,
    children: 0,
    infants: 0,
    cabinClass: 'ECONOMY',
    currency: 'MYR',
  })
  const hotelSearch = await new MockHotelOfferProvider(now).searchHotels({
    cityId: 'phu-quoc',
    checkInDate: '2026-09-12',
    checkOutDate: '2026-09-15',
    adults: 2,
    children: 0,
    rooms: 1,
    currency: 'MYR',
  })
  const pair = flightSearch.offers[0].mockFlightPair!
  const hotel = hotelSearch.offers[0].mockHotel!
  return {
    flightSearch,
    hotelSearch,
    ids: {
      selectedOutboundFlightId: pair.outboundFlightId,
      selectedReturnFlightId: pair.returnFlightId,
      selectedHotelId: hotel.hotelId,
    },
  }
}

describe('trusted travel selection context', () => {
  it('generates each offer set, fingerprint, ID resolution, and budget only once per request', async () => {
    const fixture = await fixtures()
    const searchFlights = vi.fn().mockResolvedValue(fixture.flightSearch)
    const searchHotels = vi.fn().mockResolvedValue(fixture.hotelSearch)
    const calculateBudget = vi.fn((input) => new TripBudgetService({ now }).calculate(input))
    const scope = new TrustedTravelRequestScope(
      { destination: 'Phu Quoc, Vietnam', durationDays: 4, userBudget: 5000, searchInputs },
      { searchFlights, searchHotels, calculateBudget }
    )

    const [first, second] = await Promise.all([
      buildTrustedTravelSelectionContext(scope, fixture.ids),
      buildTrustedTravelSelectionContext(scope, fixture.ids),
    ])
    const [firstBudget, secondBudget] = await Promise.all([
      buildTrustedTravelBudgetContext(scope, first),
      buildTrustedTravelBudgetContext(scope, second),
    ])

    expect(searchFlights).toHaveBeenCalledTimes(1)
    expect(searchHotels).toHaveBeenCalledTimes(1)
    expect(calculateBudget).toHaveBeenCalledTimes(1)
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(firstBudget.budgetSummary).toBe(secondBudget.budgetSummary)
    expect(calculateBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationCurrency: 'MYR',
        destinationCandidates: [],
      })
    )
    expect(firstBudget.itineraryTravelContext.planningPreview.rankedRecommendations).toEqual([])
  })

  it('starts independent flight and hotel generation concurrently', async () => {
    const fixture = await fixtures()
    const started: string[] = []
    let releaseFlights!: () => void
    let releaseHotels!: () => void
    const flightGate = new Promise<void>((resolve) => (releaseFlights = resolve))
    const hotelGate = new Promise<void>((resolve) => (releaseHotels = resolve))
    const scope = new TrustedTravelRequestScope(
      { destination: 'Phu Quoc', durationDays: 4, userBudget: 5000, searchInputs },
      {
        searchFlights: vi.fn(async () => {
          started.push('flight')
          await flightGate
          return fixture.flightSearch
        }),
        searchHotels: vi.fn(async () => {
          started.push('hotel')
          await hotelGate
          return fixture.hotelSearch
        }),
      }
    )

    const pending = buildTrustedTravelSelectionContext(scope, fixture.ids)
    await vi.waitFor(() => expect(started).toEqual(['flight', 'hotel']))
    releaseFlights()
    releaseHotels()
    await expect(pending).resolves.toMatchObject({ fingerprint: expect.any(String) })
  })

  it('rejects an invented selected ID without falling back to names', async () => {
    const fixture = await fixtures()
    const scope = new TrustedTravelRequestScope(
      { destination: 'Phu Quoc', durationDays: 4, userBudget: 5000, searchInputs },
      {
        searchFlights: vi.fn().mockResolvedValue(fixture.flightSearch),
        searchHotels: vi.fn().mockResolvedValue(fixture.hotelSearch),
      }
    )

    await expect(
      buildTrustedTravelSelectionContext(scope, {
        ...fixture.ids,
        selectedHotelId: 'invented-hotel-id',
      })
    ).rejects.toMatchObject({ code: 'OFFER_IDS_UNSUPPORTED' })
  })
})
