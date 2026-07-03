import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GeminiProvider } from '@/ai/providers/GeminiProvider'
import type { GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'

type TestGenerateContent = (
  params: GenerateContentParameters
) => Promise<Pick<GenerateContentResponse, 'text'>>

const validItinerary: GenerateItineraryResponse = {
  title: 'Kyoto in Five Days',
  summary: 'A balanced Kyoto itinerary.',
  currencyLocal: 'JPY',
  currencyUser: 'MYR',
  exchangeRate: {
    baseCurrency: 'JPY',
    quoteCurrency: 'MYR',
    rate: 0.032,
    source: 'frankfurter',
    fetchedAt: '2026-07-03T00:00:00.000Z',
    fromCache: false,
  },
  budget: {
    totalBudgetUserCurrency: 3200,
    estimatedTotalLocal: 10000,
    estimatedTotalUserCurrency: 320,
    remainingBudgetUserCurrency: 2880,
    isBudgetExceeded: false,
  },
  days: [
    {
      dayNumber: 1,
      theme: 'Arrival and temples',
      morning: [
        {
          time: '09:00',
          title: 'Kiyomizu-dera',
          description: 'Explore the historic temple complex.',
          location: 'Higashiyama',
          transport: 'Train',
          estimatedDuration: '2 hours',
          estimatedCostLocal: 2500,
          estimatedCostUserCurrency: 80,
          currencyLocal: 'JPY',
          currencyUser: 'MYR',
          tips: ['Arrive early.'],
        },
      ],
      afternoon: [],
      evening: [],
      dailyTotalLocal: 2500,
      dailyTotalUserCurrency: 80,
      notes: ['Wear comfortable shoes.'],
    },
  ],
  roadmap: [
    {
      dayNumber: 1,
      items: [
        { label: 'Hotel', kind: 'hotel', time: '08:00' },
        { label: 'Kiyomizu-dera', kind: 'activity', time: '09:00' },
      ],
    },
  ],
}

const request: GenerateItineraryRequest = {
  destination: 'Kyoto',
  budget: 3200,
  durationDays: 5,
  groupSize: 2,
  travelStyles: ['cultural'],
  accommodationType: null,
  transportationPreference: null,
  foodPreferences: ['local'],
  activityPreferences: ['museums'],
  userCurrency: 'MYR',
  destinationCurrency: 'JPY',
  exchangeRate: 0.032,
  exchangeRateSource: 'frankfurter',
  exchangeRateFetchedAt: '2026-07-03T00:00:00.000Z',
  exchangeRateFromCache: false,
  travelInterests: ['food'],
  preferredLanguage: 'en',
}

function createProvider(generateContent: TestGenerateContent) {
  return new GeminiProvider({
    apiKey: 'test-key',
    model: 'gemini-test-model',
    client: {
      models: {
        generateContent,
      },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  })
}

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the configured Gemini model and parses valid rich itinerary JSON', async () => {
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({ text: JSON.stringify(validItinerary) })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(request)).resolves.toEqual(validItinerary)

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-test-model',
        config: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
      })
    )
  })

  it('retries transient Gemini failures once before succeeding', async () => {
    const transientError = Object.assign(new Error('rate limited'), { status: 429 })
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ text: JSON.stringify(validItinerary) })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(request)).resolves.toEqual(validItinerary)

    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('throws a friendly error when Gemini returns malformed JSON', async () => {
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({ text: '```json\nnot-json\n```' })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(request)).rejects.toThrow(
      'Gemini returned malformed itinerary JSON.'
    )
  })

  it('rejects rich itinerary JSON that is missing required item costs', async () => {
    const invalid = JSON.parse(JSON.stringify(validItinerary))
    delete invalid.days[0].morning[0].estimatedCostLocal
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({ text: JSON.stringify(invalid) })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(request)).rejects.toThrow(
      'Gemini returned itinerary JSON with missing or invalid fields.'
    )
  })
})