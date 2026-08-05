import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, PUT } from './route'

import { createClient } from '@/lib/supabase/server'
import {
  TripTravelProfileError,
  TripTravelProfileService,
} from '@/services/travel/profile/tripTravelProfileService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  getForTrip: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/travel/profile/tripTravelProfileService', () => {
  class MockTripTravelProfileError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
      this.name = 'TripTravelProfileError'
    }
  }

  return {
    TripTravelProfileError: MockTripTravelProfileError,
    TripTravelProfileService: vi.fn(() => ({
      getForTrip: routeMocks.getForTrip,
      upsert: routeMocks.upsert,
    })),
  }
})

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

function request(body: unknown) {
  return new Request('http://localhost/api/trips/trip-1/travel-profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('trip travel profile route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
        }),
      },
    } as never)
    vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getTripById).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
      itineraryJson: null,
    } as never)
    routeMocks.getForTrip.mockResolvedValue({
      travelProfile: { id: 'travel-profile-1', originAirportCode: 'KUL' },
      readiness: {
        planningStatus: 'READY_FOR_SEARCH',
        missingRequiredFields: [],
        canSearchOffers: true,
        canSelectOffers: true,
        canGenerateItinerary: false,
      },
    })
    routeMocks.upsert.mockResolvedValue({
      travelProfile: { id: 'travel-profile-1', originAirportCode: 'KUL', currency: 'MYR' },
      readiness: { canSearchOffers: true },
      invalidated: [],
    })
  })

  it('reads an owned travel profile with readiness', async () => {
    const response = await GET(new Request('http://localhost/api/trips/trip-1/travel-profile'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(TripTravelProfileService).toHaveBeenCalledTimes(1)
    expect(routeMocks.getForTrip).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      hasCompleteItinerary: false,
    })
    expect(body.travelProfile).toMatchObject({ id: 'travel-profile-1' })
  })

  it('normalizes and persists partial profile updates', async () => {
    const response = await PUT(
      request({
        originAirportCode: 'kul',
        destinationAirportCode: 'kix',
        departureDate: '2026-09-01',
        returnDate: '2026-09-05',
        adults: '2',
        rooms: 1,
        currency: 'myr',
      }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )

    expect(response.status).toBe(200)
    expect(routeMocks.upsert).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      data: expect.objectContaining({
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        adults: 2,
        currency: 'MYR',
      }),
      hasCompleteItinerary: false,
    })
  })

  it('returns validation errors before updating', async () => {
    const response = await PUT(
      request({
        departureDate: '2026-09-05',
        returnDate: '2026-09-01',
      }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(routeMocks.upsert).not.toHaveBeenCalled()
  })

  it('maps service validation errors without raw details', async () => {
    routeMocks.upsert.mockRejectedValue(
      new TripTravelProfileError('INVALID_TRAVEL_PROFILE', 'Travel profile is invalid.', 400, {
        issues: ['rooms cannot exceed total travelers'],
      })
    )

    const response = await PUT(request({ originCity: 'Kuala Lumpur' }), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('INVALID_TRAVEL_PROFILE')
    expect(body.details).toEqual({ issues: ['rooms cannot exceed total travelers'] })
  })
})
