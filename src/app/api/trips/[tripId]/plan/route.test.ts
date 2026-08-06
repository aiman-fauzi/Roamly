import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

import { createClient } from '@/lib/supabase/server'
import {
  TravelPlanningError,
  TripTravelPlanningService,
} from '@/services/travel/planning/tripTravelPlanningService'
import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  plan: vi.fn(),
  previewBudget: vi.fn(),
  upsertTravelProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/travel/planning/tripTravelPlanningService', () => {
  class MockTravelPlanningError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
      this.name = 'TravelPlanningError'
    }
  }

  return {
    TravelPlanningError: MockTravelPlanningError,
    TripTravelPlanningService: vi.fn(() => ({
      plan: routeMocks.plan,
      previewBudget: routeMocks.previewBudget,
    })),
  }
})

vi.mock('@/services/travel/profile/tripTravelProfileService', () => ({
  TripTravelProfileService: vi.fn(() => ({ upsert: routeMocks.upsertTravelProfile })),
}))

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

function request(body: unknown) {
  return new Request('http://localhost/api/trips/trip-1/plan', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const validBody = {
  originAirportCode: 'kul',
  departureDate: '2026-09-01',
  adults: 2,
  rooms: 1,
  currency: 'myr',
}

describe('trip travel planning route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
          error: null,
        }),
      },
    } as never)
    vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    routeMocks.upsertTravelProfile.mockResolvedValue({
      travelProfile: { id: 'travel-profile-1' },
      readiness: { canSearchOffers: true },
      invalidated: [],
    })
    routeMocks.plan.mockResolvedValue({
      trip: { id: 'trip-1' },
      itinerary: {
        title: 'Mock plan',
        selectedFlightOfferId: 'flight-1',
        selectedHotelOfferId: 'hotel-1',
      },
      budgetSummary: { total: { amount: { amount: '100.00', currency: 'MYR' } } },
      selectedFlightOffer: { id: 'flight-1' },
      selectedHotelOffer: { id: 'hotel-1' },
      flightSearch: { status: 'SUCCESS', offers: [] },
      hotelSearch: { status: 'SUCCESS', offers: [] },
      summary: {
        eligibleCandidates: 1,
        candidatesSentToGemini: 1,
        candidatesOmitted: 0,
        persisted: true,
      },
    })
    routeMocks.previewBudget.mockResolvedValue({
      trip: { id: 'trip-1' },
      itineraryTravelContext: { dataStatus: 'mock' },
      planningPreview: { status: 'planning_preview' },
      budgetSummary: { total: { amount: { amount: '100.00', currency: 'MYR' } } },
      selectedFlightOffer: { id: 'flight-1' },
      selectedHotelOffer: { id: 'hotel-1' },
      flightSearch: { status: 'SUCCESS', offers: [] },
      hotelSearch: { status: 'SUCCESS', offers: [] },
      summary: {
        eligibleCandidates: 1,
        candidatesSentToGemini: 1,
        candidatesOmitted: 0,
        persisted: false,
      },
    })
  })

  it('delegates authenticated planning and defaults to persistence', async () => {
    const response = await POST(request(validBody), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(TripTravelProfileService).toHaveBeenCalledTimes(1)
    expect(routeMocks.upsertTravelProfile).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      data: expect.objectContaining({
        originAirportCode: 'KUL',
        departureDate: '2026-09-01',
        adults: 2,
        rooms: 1,
        currency: 'MYR',
      }),
      hasCompleteItinerary: false,
    })
    expect(TripTravelPlanningService).toHaveBeenCalledTimes(1)
    expect(routeMocks.plan).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      input: expect.objectContaining({
        originAirportCode: 'KUL',
        currency: 'MYR',
        persist: true,
      }),
    })
    expect(body.destinationContext).toEqual({
      eligibleCandidates: 1,
      candidatesSentToGemini: 1,
      omittedCandidates: 0,
    })
  })

  it('returns validation errors before planning', async () => {
    const response = await POST(request({ ...validBody, departureDate: '09/01/2026' }), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(routeMocks.plan).not.toHaveBeenCalled()
  })

  it('returns recoverable service errors without raw provider output', async () => {
    routeMocks.plan.mockRejectedValue(
      new TravelPlanningError(
        'AI_TRAVEL_OFFER_CONTRACT_VIOLATION',
        'Generated itinerary referenced unsupported travel offers.',
        422,
        {
          recoverable: true,
          category: 'AI_TRAVEL_OFFER_CONTRACT_VIOLATION',
          previousItineraryPreserved: true,
          details: { validationIssues: ['unknown flight offer'] },
        }
      )
    )

    const response = await POST(request(validBody), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.code).toBe('AI_TRAVEL_OFFER_CONTRACT_VIOLATION')
    expect(body.details).toMatchObject({
      recoverable: true,
      previousItineraryPreserved: true,
    })
    expect(JSON.stringify(body)).not.toContain('rawText')
    expect(JSON.stringify(body)).not.toContain('providerOfferId')
  })

  it('returns a planning preview when Gemini quota fails', async () => {
    routeMocks.plan.mockRejectedValue(
      new TravelPlanningError('AI_QUOTA_EXCEEDED', 'Gemini quota exceeded.', 429, {
        recoverable: true,
        category: 'AI_QUOTA_EXCEEDED',
        previousItineraryPreserved: false,
      })
    )

    const response = await POST(request(validBody), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(routeMocks.previewBudget).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      input: expect.objectContaining({
        originAirportCode: 'KUL',
        persist: false,
      }),
    })
    expect(body.itinerary).toBeNull()
    expect(body.itineraryStatus).toMatchObject({
      status: 'planning_preview_due_to_ai_failure',
      code: 'AI_QUOTA_EXCEEDED',
    })
    expect(body.itineraryTravelContext).toEqual({ dataStatus: 'mock' })
    expect(JSON.stringify(body)).not.toContain('providerDiagnostics')
  })
})
