import { describe, expect, it } from 'vitest'

import type { RankedDestinationCandidate } from '@/services/destinations/types'
import { TripBudgetService } from '@/services/travel/budget/tripBudgetService'
import { convertMoney, money } from '@/services/travel/offers/money'
import type { FlightOffer, HotelOffer } from '@/services/travel/offers/types'

const flightOffer: FlightOffer = {
  id: 'flight-1',
  provider: 'mock',
  providerOfferId: 'provider-flight-1',
  itineraries: [],
  totalPrice: money('100.00', 'USD'),
  fetchedAt: '2026-08-05T00:00:00.000Z',
}

const hotelOffer: HotelOffer = {
  id: 'hotel-1',
  provider: 'mock',
  propertyId: 'property-1',
  propertyName: 'Mock Stay',
  totalPrice: money('200.00', 'USD'),
  fetchedAt: '2026-08-05T00:00:00.000Z',
}

function attraction(
  overrides: Partial<RankedDestinationCandidate> = {}
): RankedDestinationCandidate {
  return {
    candidateId: 'ATTRACTION:central-market',
    id: 'central-market',
    entityType: 'ATTRACTION',
    entityTable: 'attractions',
    cityId: 'city-1',
    cityName: 'Kuala Lumpur',
    citySlug: 'kuala-lumpur',
    countryName: 'Malaysia',
    countrySlug: 'malaysia',
    name: 'Central Market',
    slug: 'central-market',
    description: 'A heritage market.',
    address: 'Kuala Lumpur',
    latitude: 3.145,
    longitude: 101.695,
    websiteUrl: null,
    source: 'OPENSTREETMAP',
    sourceUrl: null,
    categories: ['culture'],
    tags: ['heritage'],
    openingHours: [],
    openingHoursStatus: 'UNKNOWN',
    priceLevel: null,
    ticketPrices: [{ amount: 20, currency: 'MYR', priceType: 'FIXED', audience: 'GENERAL' }],
    ticketPriceStatus: 'VERIFIED',
    priceConfidence: 'KNOWN_PRICE',
    currency: 'MYR',
    officialUrl: null,
    officialUrlStatus: 'UNKNOWN',
    durationMinutes: 90,
    lastVerifiedAt: new Date('2026-08-04T00:00:00.000Z'),
    openingHoursKnown: false,
    factualCompletenessScore: 80,
    staleFactCount: 0,
    factualStatus: 'UNKNOWN',
    factSourceSummary: [],
    enrichmentState: 'PARTIALLY_ENRICHED',
    enrichment: null,
    distanceFromCityCenterKm: 0.9,
    rankScore: 88,
    rankReasons: ['interest match'],
    ...overrides,
  }
}

describe('TripBudgetService', () => {
  it('converts provider totals and rounds without floating-point drift', () => {
    const result = convertMoney(money('10.00', 'USD'), {
      baseCurrency: 'USD',
      quoteCurrency: 'MYR',
      rate: 4.33333333,
      source: 'test',
      fetchedAt: new Date('2026-08-05T00:00:00.000Z'),
      fromCache: false,
    })

    expect(result.original).toEqual({ amount: '10.00', currency: 'USD' })
    expect(result.converted).toEqual({ amount: '43.33', currency: 'MYR' })
  })

  it('calculates whole-trip and per-person totals with category statuses', async () => {
    const service = new TripBudgetService({
      now: () => new Date('2026-08-05T00:00:00.000Z'),
      resolveRate: async ({ baseCurrency, quoteCurrency }) => ({
        baseCurrency,
        quoteCurrency,
        rate: 4.5,
        source: 'test',
        fetchedAt: new Date('2026-08-05T00:00:00.000Z'),
        fromCache: false,
      }),
    })

    const summary = await service.calculate({
      currency: 'MYR',
      destinationCurrency: 'MYR',
      travelerCount: 2,
      durationDays: 2,
      userBudget: money('2000.00', 'MYR'),
      selectedFlightOffer: flightOffer,
      selectedHotelOffer: hotelOffer,
      destinationCandidates: [
        attraction(),
        attraction({
          candidateId: 'ATTRACTION:unknown-price',
          id: 'unknown-price',
          name: 'Mystery Museum',
          ticketPrices: [],
          ticketPriceStatus: 'UNKNOWN',
          priceConfidence: 'PRICE_UNKNOWN',
        }),
      ],
      dailyFoodBudget: money('80.00', 'MYR'),
      dailyLocalTransportBudget: money('30.00', 'MYR'),
      contingencyPercent: 10,
    })

    expect(summary.flight).toMatchObject({
      status: 'KNOWN',
      amount: { amount: '450.00', currency: 'MYR' },
    })
    expect(summary.accommodation).toMatchObject({
      status: 'KNOWN',
      amount: { amount: '900.00', currency: 'MYR' },
    })
    expect(summary.attractions).toMatchObject({
      status: 'PARTIAL',
      amount: { amount: '40.00', currency: 'MYR' },
    })
    expect(summary.food).toMatchObject({
      status: 'ESTIMATED',
      amount: { amount: '320.00', currency: 'MYR' },
    })
    expect(summary.localTransport).toMatchObject({
      status: 'ESTIMATED',
      amount: { amount: '120.00', currency: 'MYR' },
    })
    expect(summary.contingency.amount).toEqual({ amount: '183.00', currency: 'MYR' })
    expect(summary.total).toMatchObject({
      amount: { amount: '2013.00', currency: 'MYR' },
      perPersonAmount: { amount: '1006.50', currency: 'MYR' },
      remainingBudget: { amount: '-13.00', currency: 'MYR' },
      isBudgetExceeded: true,
    })
    expect(summary.costSummary).toMatchObject({
      currency: 'MYR',
      travellers: 2,
      wholeTripTotal: { amount: '2013.00', currency: 'MYR' },
      estimatedPerPersonTotal: { amount: '1006.50', currency: 'MYR' },
      flights: {
        amount: { amount: '450.00', currency: 'MYR' },
        basis: 'whole_party',
        status: 'mock_estimate',
      },
      attractions: {
        amount: { amount: '40.00', currency: 'MYR' },
        basis: 'per_person',
        status: 'mock_estimate',
      },
    })
    expect(summary.missingData).toContain('Unknown verified ticket price for Mystery Museum.')
  })

  it('does not turn missing flight and hotel offers into known costs', async () => {
    const service = new TripBudgetService({
      now: () => new Date('2026-08-05T00:00:00.000Z'),
      resolveRate: async ({ baseCurrency, quoteCurrency }) => ({
        baseCurrency,
        quoteCurrency,
        rate: 1,
        source: 'same_currency',
        fetchedAt: new Date('2026-08-05T00:00:00.000Z'),
        fromCache: false,
      }),
    })

    const summary = await service.calculate({
      currency: 'MYR',
      destinationCurrency: 'MYR',
      travelerCount: 1,
      durationDays: 1,
      destinationCandidates: [],
      dailyFoodBudget: money('0.00', 'MYR'),
      dailyLocalTransportBudget: money('0.00', 'MYR'),
      contingencyPercent: 0,
    })

    expect(summary.flight.status).toBe('UNKNOWN')
    expect(summary.accommodation.status).toBe('UNKNOWN')
    expect(summary.costSummary?.wholeTripTotal).toBeNull()
    expect(summary.costSummary?.flights.amount).toBeNull()
    expect(summary.costSummary?.hotel.amount).toBeNull()
    expect(summary.costSummary?.attractions.amount).toBeNull()
    expect(summary.missingData).toEqual(
      expect.arrayContaining(['No selected flight offer.', 'No selected hotel offer.'])
    )
  })
})
