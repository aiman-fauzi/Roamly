import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FlightOptionCard } from '@/components/features/travel/FlightOptionCard'
import { HotelOptionCard } from '@/components/features/travel/HotelOptionCard'
import { TripCostSummary } from '@/components/features/travel/TripCostSummary'
import { calculateMockTripBudgetEstimate } from '@/services/travel/budget/mockTripBudgetEstimate'
import type { FlightProvider } from '@/services/travel/flights/flightProvider'
import { FlightSearchService } from '@/services/travel/flights/flightSearchService'
import { MockFlightProvider } from '@/services/travel/flights/mockFlightProvider'
import type { FlightSearchInput } from '@/services/travel/flights/types'
import { HotelSearchService } from '@/services/travel/hotels/hotelSearchService'
import { MockHotelProvider } from '@/services/travel/hotels/mockHotelProvider'
import {
  hotelAreaPreferenceScore,
  rankCandidatesForHotelArea,
} from '@/services/travel/planning/hotelAreaInfluence'
import { createMockTripTravelSelection } from '@/services/travel/planning/mockTravelSelection'
import { buildTravelTimingConstraints } from '@/services/travel/planning/travelTiming'

const flightInput: FlightSearchInput = {
  destination: 'Phu Quoc',
  originAirportCode: 'KUL',
  destinationAirportCode: 'PQC',
  departureDate: '2026-09-12',
  returnDate: '2026-09-15',
  travellers: 2,
  cabinClass: 'economy',
  currency: 'USD',
}

async function selectedTravel() {
  const flights = await new MockFlightProvider().searchFlights(flightInput)
  const hotels = await new MockHotelProvider().searchHotels({
    destination: 'Phu Quoc',
    checkInDate: '2026-09-12',
    checkOutDate: '2026-09-15',
    travellers: 2,
    rooms: 1,
    currency: 'USD',
  })
  return createMockTripTravelSelection({
    selectedOutboundFlight: flights.outboundOptions[0],
    selectedReturnFlight: flights.returnOptions[1],
    selectedHotel: hotels.options[0],
    travellerCount: 2,
    roomCount: 1,
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    travelCurrency: 'USD',
    generatedEstimateAt: '2026-08-06T00:00:00.000Z',
  })
}

describe('mock travel foundation', () => {
  it('generates deterministic flight options for identical searches', async () => {
    const provider = new MockFlightProvider()
    const first = await provider.searchFlights(flightInput)
    const second = await provider.searchFlights(flightInput)

    expect(second).toEqual(first)
    expect(first.outboundOptions).toHaveLength(3)
    expect(first.returnOptions).toHaveLength(3)
    expect(first.outboundOptions.every((option) => option.dataStatus === 'mock')).toBe(true)
    expect(first.outboundOptions.every((option) => option.availabilityStatus === 'simulated')).toBe(
      true
    )
  })

  it('changes deterministic flight fixtures when dates change', async () => {
    const provider = new MockFlightProvider()
    const first = await provider.searchFlights(flightInput)
    const second = await provider.searchFlights({ ...flightInput, departureDate: '2026-09-13' })

    expect(second.seed).not.toBe(first.seed)
    expect(second.outboundOptions[0].id).not.toBe(first.outboundOptions[0].id)
  })

  it('scales flight pricing by traveller count', async () => {
    const provider = new MockFlightProvider()
    const twoTravellers = await provider.searchFlights(flightInput)
    const oneTraveller = await provider.searchFlights({ ...flightInput, travellers: 1 })

    expect(twoTravellers.outboundOptions[0].fare.totalAmount).toBeGreaterThan(
      oneTraveller.outboundOptions[0].fare.totalAmount
    )
    expect(twoTravellers.outboundOptions[0].fare.totalAmount).toBe(
      twoTravellers.outboundOptions[0].fare.perTravellerTotalAmount * 2
    )
  })

  it('generates deterministic hotel options with night and tax calculations', async () => {
    const provider = new MockHotelProvider()
    const result = await provider.searchHotels({
      destination: 'Phu Quoc',
      checkInDate: '2026-09-12',
      checkOutDate: '2026-09-15',
      travellers: 2,
      rooms: 1,
      currency: 'USD',
    })

    expect(result.options).toHaveLength(4)
    expect(result.options[0].nights).toBe(3)
    expect(result.options[0].pricing.staySubtotalAmount).toBe(
      result.options[0].pricing.nightlyAmount *
        result.options[0].nights *
        result.options[0].roomCount
    )
    expect(result.options[0].pricing.taxesAmount).toBeGreaterThan(0)
    expect(result.options[0].pricing.totalAmount).toBe(
      result.options[0].pricing.staySubtotalAmount + result.options[0].pricing.taxesAmount
    )
    expect(result.options.every((option) => option.guestRating === null)).toBe(true)
  })

  it('supports provider replacement through interfaces', async () => {
    const fakeProvider: FlightProvider = {
      providerKey: 'fake',
      searchFlights: async () => ({
        provider: 'mock',
        dataStatus: 'mock',
        availabilityStatus: 'simulated',
        seed: 1,
        outboundOptions: [],
        returnOptions: [],
      }),
    }

    await expect(new FlightSearchService(fakeProvider).search(flightInput)).resolves.toMatchObject({
      seed: 1,
      outboundOptions: [],
    })
    await expect(
      new HotelSearchService().search({
        destination: 'Phu Quoc',
        checkInDate: '2026-09-12',
        checkOutDate: '2026-09-15',
        travellers: 2,
        rooms: 1,
        currency: 'USD',
      })
    ).resolves.toMatchObject({ provider: 'mock' })
  })

  it('applies late-arrival and early-departure timing rules', async () => {
    const flights = await new MockFlightProvider().searchFlights(flightInput)
    const selection = createMockTripTravelSelection({
      selectedOutboundFlight: flights.outboundOptions[2],
      selectedReturnFlight: flights.returnOptions[0],
      selectedHotel: null,
      travellerCount: 2,
      roomCount: 1,
      departureDate: '2026-09-12',
      returnDate: '2026-09-15',
      originAirportCode: 'KUL',
      destinationAirportCode: 'PQC',
      travelCurrency: 'USD',
    })

    const timing = buildTravelTimingConstraints(selection)

    expect(timing.dayOne.recommendation).toBe('light_nearby_evening')
    expect(timing.finalDay.recommendation).toBe('airport_transfer_only')
  })

  it('uses hotel area as an attraction ranking signal', () => {
    const north = hotelAreaPreferenceScore(
      { categories: ['safari'], tags: ['family'] },
      'north_phu_quoc'
    )
    const south = hotelAreaPreferenceScore(
      { categories: ['safari'], tags: ['family'] },
      'south_phu_quoc'
    )

    expect(north.score).toBeGreaterThan(south.score)
    expect(north.reasons).toContain('north_phu_quoc preference: safari')
  })

  it('changes recommendation ordering across Phu Quoc hotel areas without eliminating options', () => {
    const candidates = [
      { id: 'market', rankScore: 80, categories: ['night_market'], tags: ['food'] },
      { id: 'beach', rankScore: 80, categories: ['beach'], tags: ['nature'] },
      { id: 'south', rankScore: 80, categories: ['cable_car'], tags: ['island'] },
      { id: 'north', rankScore: 80, categories: ['safari'], tags: ['family'] },
    ]

    expect(rankCandidatesForHotelArea(candidates, 'duong_dong')[0].id).toBe('market')
    expect(rankCandidatesForHotelArea(candidates, 'long_beach')[0].id).toBe('beach')
    expect(rankCandidatesForHotelArea(candidates, 'south_phu_quoc')[0].id).toBe('south')
    expect(rankCandidatesForHotelArea(candidates, 'north_phu_quoc')[0].id).toBe('north')
    expect(rankCandidatesForHotelArea(candidates, 'north_phu_quoc')).toHaveLength(4)
  })

  it('calculates mock budget totals and preserves missing estimates', async () => {
    const selection = await selectedTravel()
    const estimate = calculateMockTripBudgetEstimate({ selection, attractionsTotal: null })

    expect(estimate.status).toBe('mock_estimate')
    expect(estimate.flightsTotal).not.toBeNull()
    expect(estimate.hotelTotal).not.toBeNull()
    expect(estimate.attractionsTotal).toBeNull()
    expect(estimate.missingEstimates).toContain('Attraction ticket estimates unavailable.')
    expect(estimate.estimatedGrandTotal).toBeGreaterThan(estimate.foodTotal)
  })

  it('renders mock labels and avoids live-availability claims', async () => {
    const selection = await selectedTravel()
    const estimate = calculateMockTripBudgetEstimate({ selection, attractionsTotal: null })

    render(
      <>
        {selection.selectedOutboundFlight && (
          <FlightOptionCard option={selection.selectedOutboundFlight} title="Outbound flight" />
        )}
        {selection.selectedHotel && <HotelOptionCard option={selection.selectedHotel} />}
        <TripCostSummary estimate={estimate} />
      </>
    )

    expect(screen.getAllByText(/sample travel option/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/mock/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/book now/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/only \d+ rooms left/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/discount/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reviews/i)).not.toBeInTheDocument()
  })
})
