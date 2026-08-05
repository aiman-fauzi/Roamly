import { describe, expect, it } from 'vitest'

import { buildItineraryPrompt } from '@/ai/prompts/itineraryPrompt'
import type { GenerateItineraryRequest } from '@/ai/types'

const baseRequest: GenerateItineraryRequest = {
  destination: 'Kyoto',
  budget: 3200,
  durationDays: 5,
  groupSize: 2,
  travelStyles: [],
  accommodationType: null,
  transportationPreference: null,
  foodPreferences: [],
  activityPreferences: [],
  userCurrency: 'MYR',
  destinationCurrency: 'JPY',
  exchangeRate: 0.032,
  exchangeRateSource: 'frankfurter',
  exchangeRateFetchedAt: '2026-07-03T00:00:00.000Z',
  exchangeRateFromCache: false,
  travelInterests: ['food'],
  preferredLanguage: 'en',
}

describe('buildItineraryPrompt', () => {
  it('lists selected trip styles and food preferences as comma-separated labels', () => {
    const prompt = buildItineraryPrompt({
      ...baseRequest,
      travelStyles: ['adventure', 'cultural', 'relaxation'],
      foodPreferences: ['halal', 'local', 'street_food'],
    })

    expect(prompt).toContain('Trip Style:\nAdventure, Cultural, Relaxation')
    expect(prompt).toContain('Food Preferences:\nHalal, Local Cuisine, Street Food')
  })

  it('includes currency, exchange-rate, budget, and rich JSON requirements', () => {
    const prompt = buildItineraryPrompt(baseRequest)

    expect(prompt).toContain('- User currency: MYR')
    expect(prompt).toContain('- Destination/local currency: JPY')
    expect(prompt).toContain('- Exchange rate: 1 JPY = 0.032 MYR')
    expect(prompt).toContain('estimatedCostLocal')
    expect(prompt).toContain('estimatedCostUserCurrency')
    expect(prompt).toContain('dailyTotalLocal')
    expect(prompt).toContain('dailyTotalUserCurrency')
    expect(prompt).toContain('Grand total')
    expect(prompt).toContain('roadmap')
  })

  it('does not include markdown code fences in the JSON output instructions', () => {
    const prompt = buildItineraryPrompt(baseRequest)

    expect(prompt).not.toContain('```')
    expect(prompt).toContain('Do not include markdown, explanations, or code fences.')
  })

  it('includes supplied destination candidates and candidate-ID rules', () => {
    const prompt = buildItineraryPrompt({
      ...baseRequest,
      destinationContext: {
        cityId: 'city-1',
        candidateCount: 1,
        omittedCandidateCount: 0,
        serializedSize: 0,
        maxSerializedSize: 12_000,
        clusters: [],
        nearestNeighbors: [],
        candidates: [
          {
            id: 'ATTRACTION:central-market',
            type: 'ATTRACTION',
            name: 'Central Market',
            latitude: 3.145,
            longitude: 101.695,
            categories: ['culture'],
            tags: ['heritage'],
            openingHours: [],
            openingHoursStatus: 'UNKNOWN',
            priceConfidence: 'PRICE_UNKNOWN',
            openingHoursKnown: false,
            ticketPrices: [],
            ticketPriceStatus: 'UNKNOWN',
            source: 'openstreetmap',
            officialUrlStatus: 'UNKNOWN',
            lastVerifiedAt: '2026-08-04T00:00:00.000Z',
            factualCompletenessScore: 70,
            staleFactCount: 0,
            factualStatus: 'UNKNOWN',
            factSourceSummary: [],
            rankScore: 90,
            rankReasons: ['interest match'],
            enrichmentState: 'PARTIALLY_ENRICHED',
          },
        ],
      },
    })

    expect(prompt).toContain('Supplied Destination Candidates')
    expect(prompt).toContain('ATTRACTION:central-market')
    expect(prompt).toContain('Do not invent attractions')
    expect(prompt).toContain('If openingHoursKnown is false')
    expect(prompt).toContain('If staleFactCount is greater than 0')
    expect(prompt).toContain('Prefer VERIFIED facts over STALE facts')
    expect(prompt).toContain('"candidateId": "ATTRACTION:stable-id-from-candidates"')
    expect(prompt).toContain('"openingHoursKnown": false')
    expect(prompt).toContain('"openingHoursStatus": "UNKNOWN"')
    expect(prompt).toContain('"ticketPriceStatus": "UNKNOWN"')
    expect(prompt).toContain('"priceConfidence": "PRICE_UNKNOWN"')
    expect(prompt).toContain('"lastVerifiedAt": "2026-08-04T00:00:00.000Z"')
  })
})
