import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

import { createClient } from '@/lib/supabase/server'
import { createDefaultTravelOfferService } from '@/services/travel/offers/travelOfferService'
import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'
import { TripTravelSearchRequestService } from '@/services/travel/profile/tripTravelSearchRequestService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  searchFlights: vi.fn(),
  buildSearchRequests: vi.fn(),
  upsertTravelProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/travel/offers/travelOfferService', () => ({
  createDefaultTravelOfferService: vi.fn(() => ({ searchFlights: routeMocks.searchFlights })),
}))

vi.mock('@/services/travel/profile/tripTravelSearchRequestService', () => ({
  TripTravelSearchRequestService: vi.fn(() => ({ build: routeMocks.buildSearchRequests })),
}))

vi.mock('@/services/travel/profile/tripTravelProfileService', () => ({
  TripTravelProfileService: vi.fn(() => ({ upsert: routeMocks.upsertTravelProfile })),
}))

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

function request(body: unknown) {
  return new Request('http://localhost/api/trips/trip-1/flights', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('flight offer route', () => {
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
    routeMocks.upsertTravelProfile.mockResolvedValue({
      travelProfile: { id: 'profile-1' },
      readiness: { canSearchOffers: true },
      invalidated: [],
    })
    routeMocks.buildSearchRequests.mockResolvedValue({
      flightRequest: {
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        departureDate: '2026-09-01',
        returnDate: '2026-09-05',
        adults: 2,
        children: 0,
        infants: 0,
        cabinClass: 'ECONOMY',
        currency: 'MYR',
      },
    })
    routeMocks.searchFlights.mockResolvedValue({
      status: 'SUCCESS',
      provider: 'mock',
      fetchedAt: '2026-08-05T00:00:00.000Z',
      expiresAt: '2026-08-05T00:15:00.000Z',
      offers: [{ id: 'flight-1', provider: 'mock', totalPrice: { amount: '100.00', currency: 'MYR' } }],
      cacheStatus: 'MISS',
      requestFingerprint: 'fingerprint',
    })
  })

  it('requires authentication before searching', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    } as never)

    const response = await POST(request({}), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })

    expect(response.status).toBe(401)
    expect(routeMocks.searchFlights).not.toHaveBeenCalled()
  })

  it('validates trip ownership', async () => {
    vi.mocked(getTripById).mockResolvedValue(null)

    const response = await POST(
      request({
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        departureDate: '2026-09-01',
        adults: 1,
        currency: 'MYR',
      }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
    expect(routeMocks.searchFlights).not.toHaveBeenCalled()
  })

  it('normalizes and delegates an owned flight search', async () => {
    const response = await POST(
      request({
        originAirportCode: 'kul',
        destinationAirportCode: 'kix',
        departureDate: '2026-09-01',
        adults: '2',
        currency: 'myr',
        refreshOffers: true,
      }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(createDefaultTravelOfferService).toHaveBeenCalledTimes(1)
    expect(TripTravelProfileService).toHaveBeenCalledTimes(1)
    expect(routeMocks.upsertTravelProfile).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      data: expect.objectContaining({
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        departureDate: '2026-09-01',
        adults: 2,
        currency: 'MYR',
      }),
      hasCompleteItinerary: false,
    })
    expect(TripTravelSearchRequestService).toHaveBeenCalledTimes(1)
    expect(routeMocks.buildSearchRequests).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      overrides: expect.objectContaining({
        originAirportCode: 'KUL',
        refreshOffers: true,
      }),
    })
    expect(routeMocks.searchFlights).toHaveBeenCalledWith(
      expect.objectContaining({
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        adults: 2,
        currency: 'MYR',
      }),
      { refresh: true }
    )
    expect(body.offers).toHaveLength(1)
  })

  it('maps provider rate limits to sanitized route errors', async () => {
    routeMocks.searchFlights.mockResolvedValue({
      status: 'RATE_LIMITED',
      provider: 'mock',
      fetchedAt: '2026-08-05T00:00:00.000Z',
      expiresAt: '2026-08-05T00:15:00.000Z',
      offers: [],
      cacheStatus: 'MISS',
      warning: 'Mock provider simulated rate limiting.',
    })

    const response = await POST(
      request({
        originAirportCode: 'KUL',
        destinationAirportCode: 'KIX',
        departureDate: '2026-09-01',
        adults: 1,
        currency: 'MYR',
      }),
      { params: Promise.resolve({ tripId: 'trip-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.code).toBe('FLIGHT_RATE_LIMITED')
    expect(body.details).toMatchObject({
      provider: 'mock',
      status: 'RATE_LIMITED',
      warning: 'Mock provider simulated rate limiting.',
    })
    expect(JSON.stringify(body)).not.toContain('providerOfferId')
  })
})
