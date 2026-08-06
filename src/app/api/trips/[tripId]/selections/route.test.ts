import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

import { createClient } from '@/lib/supabase/server'
import { TripOfferSelectionService } from '@/services/travel/persistence/tripOfferSelectionService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  getSelections: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/travel/persistence/tripOfferSelectionService', () => ({
  TripOfferSelectionService: vi.fn(() => ({ getSelections: routeMocks.getSelections })),
}))

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

describe('trip offer selections route', () => {
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
    routeMocks.getSelections.mockResolvedValue({
      flightSelection: null,
      hotelSelection: null,
      historicalSelectionCounts: { flights: 1, hotels: 2 },
    })
  })

  it('reads current selections for an owned trip', async () => {
    const response = await GET(new Request('http://localhost/api/trips/trip-1/selections'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(TripOfferSelectionService).toHaveBeenCalledTimes(1)
    expect(routeMocks.getSelections).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
    })
    expect(body.historicalSelectionCounts).toEqual({ flights: 1, hotels: 2 })
  })

  it('validates trip ownership before reading selections', async () => {
    vi.mocked(getTripById).mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/trips/trip-1/selections'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
    expect(routeMocks.getSelections).not.toHaveBeenCalled()
  })
})
