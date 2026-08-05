import { describe, expect, it } from 'vitest'

import { MockFlightOfferProvider, MockHotelOfferProvider } from '@/services/travel/offers/mockProviders'
import { buildOfferSearchFingerprint, InMemoryOfferCache } from '@/services/travel/offers/offerCache'
import { rankFlightOffers, rankHotelOffers } from '@/services/travel/offers/selection'
import { TravelOfferService } from '@/services/travel/offers/travelOfferService'
import type { FlightSearchRequest, HotelSearchRequest } from '@/services/travel/offers/types'

const flightRequest: FlightSearchRequest = {
  originAirportCode: 'KUL',
  destinationAirportCode: 'KIX',
  departureDate: '2026-09-01',
  returnDate: '2026-09-05',
  adults: 2,
  children: 0,
  infants: 0,
  cabinClass: 'ECONOMY',
  currency: 'MYR',
}

const hotelRequest: HotelSearchRequest = {
  cityId: '11111111-1111-4111-8111-111111111111',
  checkInDate: '2026-09-01',
  checkOutDate: '2026-09-05',
  adults: 2,
  rooms: 1,
  currency: 'MYR',
}

describe('travel offer providers and cache', () => {
  it('returns deterministic mock flight and hotel offers with totals and expirations', async () => {
    const flights = await new MockFlightOfferProvider().searchFlights(flightRequest)
    const hotels = await new MockHotelOfferProvider().searchHotels(hotelRequest)

    expect(flights.status).toBe('SUCCESS')
    expect(flights.offers).toHaveLength(2)
    expect(flights.offers.map((offer) => offer.refundable)).toEqual([false, true])
    expect(flights.offers[0]).toMatchObject({
      totalPrice: { amount: '840.00', currency: 'MYR' },
      taxes: { amount: '151.20', currency: 'MYR' },
      expiresAt: '2026-08-05T00:15:00.000Z',
    })

    expect(hotels.status).toBe('SUCCESS')
    expect(hotels.offers).toHaveLength(2)
    expect(hotels.offers.map((offer) => offer.refundable)).toEqual([false, true])
    expect(hotels.offers[0].totalPrice).toEqual({ amount: '720.00', currency: 'MYR' })
  })

  it('supports deterministic no-results, rate-limit, and temporary-failure modes', async () => {
    const provider = new MockFlightOfferProvider()

    await expect(provider.searchFlights({ ...flightRequest, simulationMode: 'EMPTY' })).resolves.toMatchObject({
      status: 'NO_RESULTS',
      offers: [],
    })
    await expect(provider.searchFlights({ ...flightRequest, simulationMode: 'RATE_LIMITED' })).resolves.toMatchObject({
      status: 'RATE_LIMITED',
      offers: [],
      warning: 'Mock provider simulated rate limiting.',
    })
    await expect(provider.searchFlights({ ...flightRequest, simulationMode: 'TEMPORARY_FAILURE' })).resolves.toMatchObject({
      status: 'TEMPORARY_FAILURE',
      offers: [],
      warning: 'Mock provider simulated a temporary failure.',
    })
  })

  it('uses provider-aware fingerprints and cache hits for identical searches', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z')
    const service = new TravelOfferService({
      flightProvider: new MockFlightOfferProvider(() => now),
      flightTtlSeconds: 60,
      now: () => now,
    })

    const first = await service.searchFlights(flightRequest)
    const second = await service.searchFlights(flightRequest)

    expect(first.cacheStatus).toBe('MISS')
    expect(second.cacheStatus).toBe('HIT')
    expect(second.requestFingerprint).toBe(first.requestFingerprint)
    expect(second.offers[0].id).toBe(first.offers[0].id)
  })

  it('expires cache entries and deduplicates concurrent identical loads', async () => {
    const cache = new InMemoryOfferCache<{ value: number }>()
    let loads = 0
    let current = new Date('2026-08-05T00:00:00.000Z')

    const first = await cache.getOrSet(
      'key',
      async () => ({ value: ++loads }),
      { ttlSeconds: 10, now: current }
    )
    const hit = await cache.getOrSet('key', async () => ({ value: ++loads }), {
      ttlSeconds: 10,
      now: current,
    })
    current = new Date('2026-08-05T00:00:11.000Z')
    const expired = await cache.getOrSet('key', async () => ({ value: ++loads }), {
      ttlSeconds: 10,
      now: current,
    })

    expect(first.cacheStatus).toBe('MISS')
    expect(hit.cacheStatus).toBe('HIT')
    expect(expired.cacheStatus).toBe('MISS')
    expect(loads).toBe(2)

    let release: ((value: { value: number }) => void) | undefined
    const pendingCache = new InMemoryOfferCache<{ value: number }>()
    const pendingOne = pendingCache.getOrSet(
      'same',
      () =>
        new Promise<{ value: number }>((resolve) => {
          loads += 1
          release = resolve
        }),
      { ttlSeconds: 10, now: current }
    )
    const pendingTwo = pendingCache.getOrSet('same', async () => ({ value: 99 }), {
      ttlSeconds: 10,
      now: current,
    })
    release?.({ value: 42 })

    await expect(Promise.all([pendingOne, pendingTwo])).resolves.toEqual([
      expect.objectContaining({ value: { value: 42 } }),
      expect.objectContaining({ value: { value: 42 } }),
    ])
    expect(loads).toBe(3)
  })

  it('keeps fingerprints stable while changing with price-sensitive fields', () => {
    const first = buildOfferSearchFingerprint({ provider: 'mock', adults: 1, currency: 'MYR' })
    const reordered = buildOfferSearchFingerprint({ currency: 'MYR', adults: 1, provider: 'mock' })
    const changed = buildOfferSearchFingerprint({ provider: 'mock', adults: 2, currency: 'MYR' })

    expect(first).toBe(reordered)
    expect(first).not.toBe(changed)
  })

  it('ranks cheapest flights and nearby hotels deterministically', async () => {
    const flights = await new MockFlightOfferProvider().searchFlights(flightRequest)
    const hotels = await new MockHotelOfferProvider().searchHotels(hotelRequest)

    expect(rankFlightOffers(flights.offers, 'CHEAPEST')[0].id).toContain('connect')
    expect(
      rankHotelOffers(hotels.offers, 'NEAREST_TO_ITINERARY', {
        latitude: 3.151,
        longitude: 101.708,
      })[0].propertyName
    ).toBe('Mock Flexible Suites')
  })
})
