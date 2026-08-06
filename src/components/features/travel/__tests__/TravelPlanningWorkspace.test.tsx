import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TravelPlanningWorkspace } from '@/components/features/travel/TravelPlanningWorkspace'
import type {
  EstimatedCost,
  TripBudgetCostSummary,
  TripBudgetSummary,
} from '@/services/travel/budget/types'
import {
  MockFlightOfferProvider,
  MockHotelOfferProvider,
} from '@/services/travel/offers/mockProviders'
import type { FlightSearchResult, HotelSearchResult } from '@/services/travel/offers/types'
import type { ValidTravelSelectionResponse } from '@/services/travel/persistence/tripTravelSelectionService'
import { buildItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'
import type { TripWithPreferences } from '@/types/trip'

const previewDate = new Date('2026-08-06T00:00:00.000Z')
const trip: TripWithPreferences = {
  id: 'trip-1',
  userId: 'user-1',
  title: 'Phu Quoc 4D3N',
  status: 'DRAFT' as TripWithPreferences['status'],
  itineraryJson: null,
  createdAt: previewDate,
  updatedAt: previewDate,
  preferenceSet: {
    id: 'preferences-1',
    tripId: 'trip-1',
    destination: 'Phu Quoc',
    budget: 5000,
    travelStyles: ['balanced'],
    foodPreferences: ['local food'],
    accommodationType: 'hotel',
    transportationPreference: 'taxi',
    activityPreferences: ['beach', 'nature'],
    groupSize: 2,
    durationDays: 4,
    createdAt: previewDate,
    updatedAt: previewDate,
  },
}

function estimatedCost(amount: string | null, basis: EstimatedCost['basis']): EstimatedCost {
  return {
    amount: amount == null ? null : { amount, currency: 'MYR' },
    currency: 'MYR',
    basis,
    status: amount == null ? 'unavailable' : 'mock_estimate',
  }
}

const costSummary: TripBudgetCostSummary = {
  currency: 'MYR',
  travellers: 2,
  wholeTripTotal: { amount: '2949.10', currency: 'MYR' },
  estimatedPerPersonTotal: { amount: '1474.55', currency: 'MYR' },
  flights: estimatedCost('1126.00', 'whole_party'),
  hotel: estimatedCost('675.00', 'per_trip'),
  attractions: estimatedCost(null, 'per_person'),
  food: estimatedCost('640.00', 'per_person'),
  localTransport: estimatedCost('240.00', 'per_person'),
  contingency: estimatedCost('268.10', 'per_trip'),
  status: 'mock_estimate',
}

const budgetSummary = { currency: 'MYR', costSummary } as TripBudgetSummary

async function travelFixtures() {
  const flights = await new MockFlightOfferProvider().searchFlights({
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    adults: 2,
    cabinClass: 'ECONOMY',
    currency: 'MYR',
  })
  const hotels = await new MockHotelOfferProvider().searchHotels({
    cityId: '11111111-1111-4111-8111-111111111111',
    checkInDate: '2026-09-12',
    checkOutDate: '2026-09-15',
    adults: 2,
    rooms: 1,
    currency: 'MYR',
  })
  return { flights, hotels }
}

function validSelectionResponse(
  flights: FlightSearchResult,
  hotels: HotelSearchResult,
  version = 1
): ValidTravelSelectionResponse {
  const selectedFlightOffer = flights.offers[0]
  const selectedHotelOffer = hotels.offers[0]
  const context = buildItineraryTravelContext({
    selectedFlightOffer,
    selectedHotelOffer,
    budgetSummary,
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    travellerCount: 2,
    roomCount: 1,
    destinationCandidates: [],
  })
  return {
    state: 'valid',
    version,
    reviewedAt: '2026-08-06T00:00:00.000Z',
    searchInputs: {
      originAirportCode: 'KUL',
      destinationAirportCode: 'PQC',
      outboundDate: '2026-09-12',
      returnDate: '2026-09-15',
      travellers: 2,
      rooms: 1,
      cabinClass: 'ECONOMY',
      currency: 'MYR',
    },
    selectedOutboundFlightId: selectedFlightOffer.mockFlightPair!.outboundFlightId,
    selectedReturnFlightId: selectedFlightOffer.mockFlightPair!.returnFlightId,
    selectedHotelId: selectedHotelOffer.mockHotel!.hotelId,
    flightSearch: flights,
    hotelSearch: hotels,
    budgetSummary,
    itineraryTravelContext: context,
    planningPreview: context.planningPreview,
    message: 'Your reviewed sample travel options have been restored.',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TravelPlanningWorkspace', () => {
  it('requires a reviewed server budget and invalidates it when selections change', async () => {
    const { flights, hotels } = await travelFixtures()
    const reviewed = validSelectionResponse(flights, hotels)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/travel-selection') && !init?.method) {
        return Response.json({ state: 'none', version: 0 })
      }
      if (url.endsWith('/flights')) return Response.json(flights)
      if (url.endsWith('/hotels')) return Response.json(hotels)
      if (url.endsWith('/travel-selection') && init?.method === 'PUT') {
        return Response.json(reviewed)
      }
      if (url.endsWith('/planning-preview')) {
        return Response.json({ planningPreview: reviewed.planningPreview })
      }
      return Response.json({ error: 'Unexpected request' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)

    const reviewButton = screen.getByRole('button', { name: 'Review estimated budget' })
    const generateButton = screen.getByRole('button', { name: 'Generate itinerary' })
    expect(reviewButton).toBeDisabled()
    expect(generateButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Search sample travel' }))
    await waitFor(() => expect(reviewButton).toBeEnabled())
    expect(generateButton).toBeDisabled()

    fireEvent.click(reviewButton)
    expect(await screen.findByText('Estimated whole trip')).toBeVisible()
    expect(generateButton).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Roamly Long Beach Resort/i }))
    expect(generateButton).toBeDisabled()
    expect(screen.queryByText('Estimated whole trip')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trips/trip-1/travel-selection',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('restores reviewed selections after remount and keeps the budget consistent', async () => {
    const { flights, hotels } = await travelFixtures()
    const restored = validSelectionResponse(flights, hotels, 3)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/planning-preview')
        ? Response.json({ planningPreview: restored.planningPreview })
        : Response.json(restored)
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)
    expect(
      await screen.findByText('Your reviewed sample travel options have been restored.')
    ).toBeVisible()
    expect(screen.getByText('MYR 2,949.1')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeEnabled()

    first.unmount()
    render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)
    expect(
      await screen.findByText('Your reviewed sample travel options have been restored.')
    ).toBeVisible()
    expect(screen.getByText('MYR 2,949.1')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('clears a restored reviewed selection and removes its trusted budget', async () => {
    const { flights, hotels } = await travelFixtures()
    const restored = validSelectionResponse(flights, hotels, 3)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Response.json({ state: 'none', version: 4 })
      if (String(input).endsWith('/planning-preview')) {
        return Response.json({ planningPreview: restored.planningPreview })
      }
      return Response.json(restored)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)
    expect(await screen.findByText('Estimated whole trip')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Clear reviewed selection' }))

    expect(await screen.findByText('Reviewed sample travel selection cleared.')).toBeVisible()
    expect(screen.queryByText('Estimated whole trip')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trips/trip-1/travel-selection?expectedVersion=3',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('shows stale state without displaying an outdated trusted budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          state: 'stale',
          version: 2,
          reasonCode: 'FINGERPRINT_MISMATCH',
          message: 'Your trip details changed, so please review the latest sample travel options.',
          searchInputs: {
            originAirportCode: 'KUL',
            destinationAirportCode: 'PQC',
            outboundDate: '2026-09-13',
            returnDate: '2026-09-16',
            travellers: 3,
            rooms: 1,
            cabinClass: 'ECONOMY',
            currency: 'MYR',
          },
        })
      )
    )

    render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)

    expect(
      await screen.findByText(
        'Your trip details changed, so please review the latest sample travel options.'
      )
    ).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Travellers' })).toHaveValue(3)
    expect(screen.queryByText('Estimated whole trip')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeDisabled()
  })

  it('keeps restored travel usable when lazy recommendations fail and retries separately', async () => {
    const { flights, hotels } = await travelFixtures()
    const restored = validSelectionResponse(flights, hotels, 2)
    let previewAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/planning-preview')) {
        previewAttempts += 1
        if (previewAttempts === 1) {
          return Response.json(
            { error: 'Destination recommendations are temporarily unavailable.' },
            { status: 503 }
          )
        }
        return Response.json({ planningPreview: restored.planningPreview })
      }
      return Response.json(restored)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TravelPlanningWorkspace trip={trip} onComplete={vi.fn()} />)

    expect(await screen.findByText('Estimated whole trip')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeEnabled()
    expect(
      await screen.findByText('Destination recommendations are temporarily unavailable.')
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Retry recommendations' }))
    await waitFor(() => expect(previewAttempts).toBe(2))
    expect(screen.queryByRole('button', { name: 'Retry recommendations' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeEnabled()
  })
})
