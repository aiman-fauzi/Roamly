import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

import { createClient } from '@/lib/supabase/server'
import {
  TripOfferSelectionError,
  TripOfferSelectionService,
} from '@/services/travel/persistence/tripOfferSelectionService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  selectFlight: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/travel/persistence/tripOfferSelectionService', () => {
  class MockTripOfferSelectionError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
      this.name = 'TripOfferSelectionError'
    }
  }

  return {
    TripOfferSelectionError: MockTripOfferSelectionError,
    TripOfferSelectionService: vi.fn(() => ({ selectFlight: routeMocks.selectFlight })),
  }
})

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

function request(body: unknown) {
  return new Request('http://localhost/api/trips/trip-1/flights/select', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('flight offer selection route', () => {
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
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    routeMocks.selectFlight.mockResolvedValue({
      id: 'flight-selection-1',
      offerId: 'flight-offer-1',
      status: 'SELECTED',
      selectionSource: 'USER_SELECTED',
      requiresRefresh: false,
    })
  })

  it('delegates an owned offer selection', async () => {
    const response = await POST(
      request({ offerId: 'flight-offer-1', refreshOffers: true, simulationMode: 'NORMAL' }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(TripOfferSelectionService).toHaveBeenCalledTimes(1)
    expect(routeMocks.selectFlight).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      offerId: 'flight-offer-1',
      refreshOffers: true,
      simulationMode: 'NORMAL',
    })
    expect(body.flightSelection).toMatchObject({
      id: 'flight-selection-1',
      selectionSource: 'USER_SELECTED',
    })
  })

  it('returns validation errors before selecting', async () => {
    const response = await POST(request({ offerId: '' }), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(routeMocks.selectFlight).not.toHaveBeenCalled()
  })

  it('maps unknown offer errors without exposing provider identifiers', async () => {
    routeMocks.selectFlight.mockRejectedValue(
      new TripOfferSelectionError(
        'UNKNOWN_FLIGHT_OFFER_ID',
        'Selected flight offer is not available for this trip search.',
        422,
        { requestFingerprint: 'fingerprint-1' }
      )
    )

    const response = await POST(request({ offerId: 'other-trip-offer' }), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.code).toBe('UNKNOWN_FLIGHT_OFFER_ID')
    expect(JSON.stringify(body)).not.toContain('providerOfferId')
  })
})
