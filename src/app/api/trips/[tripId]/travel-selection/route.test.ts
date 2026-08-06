import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET, PUT } from './route'

import { createClient } from '@/lib/supabase/server'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/tripService', () => ({ getTripById: vi.fn() }))
vi.mock('@/services/userService', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/travel/persistence/tripTravelSelectionService', () => {
  class MockTravelSelectionError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
      this.name = 'TravelSelectionError'
    }
  }

  return {
    TravelSelectionError: MockTravelSelectionError,
    TripTravelSelectionService: vi.fn(() => routeMocks),
  }
})

const context = { params: Promise.resolve({ tripId: 'trip-1' }) }
const validSelection = {
  originAirportCode: 'KUL',
  destinationAirportCode: 'PQC',
  outboundDate: '2026-09-12',
  returnDate: '2026-09-15',
  travellers: 2,
  rooms: 1,
  cabinClass: 'ECONOMY',
  currency: 'MYR',
  selectedOutboundFlightId: 'outbound-1',
  selectedReturnFlightId: 'return-1',
  selectedHotelId: 'hotel-1',
  expectedVersion: 0,
}

function authenticatedSession(userId = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: `${userId}@example.com` } },
        error: null,
      }),
    },
  } as never)
  vi.mocked(ensureUser).mockResolvedValue({ id: userId } as never)
}

describe('trip travel selection route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedSession()
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    routeMocks.get.mockResolvedValue({ state: 'none', version: 0 })
    routeMocks.save.mockResolvedValue({ state: 'valid', version: 1 })
    routeMocks.clear.mockResolvedValue({ state: 'none', version: 2 })
  })

  it('loads only the authenticated owner selection', async () => {
    const response = await GET(
      new Request('http://localhost/api/trips/trip-1/travel-selection'),
      context
    )

    expect(response.status).toBe(200)
    expect(routeMocks.get).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'trip-1', userId: 'user-1' })
    )
  })

  it('does not reveal another user trip or call the selection service', async () => {
    authenticatedSession('other-user')
    vi.mocked(getTripById).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/trips/trip-1/travel-selection'),
      context
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
    expect(routeMocks.get).not.toHaveBeenCalled()
  })

  it('validates and saves reviewed identifiers for the owned trip', async () => {
    const response = await PUT(
      new Request('http://localhost/api/trips/trip-1/travel-selection', {
        method: 'PUT',
        body: JSON.stringify(validSelection),
      }),
      context
    )

    expect(response.status).toBe(200)
    expect(routeMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        userId: 'user-1',
        selection: validSelection,
      })
    )
  })

  it('rejects malformed dates before invoking deterministic regeneration', async () => {
    const response = await PUT(
      new Request('http://localhost/api/trips/trip-1/travel-selection', {
        method: 'PUT',
        body: JSON.stringify({ ...validSelection, returnDate: validSelection.outboundDate }),
      }),
      context
    )

    expect(response.status).toBe(400)
    expect(routeMocks.save).not.toHaveBeenCalled()
  })

  it('clears with optimistic concurrency version', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/trips/trip-1/travel-selection?expectedVersion=1', {
        method: 'DELETE',
      }),
      context
    )

    expect(response.status).toBe(200)
    expect(routeMocks.clear).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        userId: 'user-1',
        expectedVersion: 1,
      })
    )
  })
})
