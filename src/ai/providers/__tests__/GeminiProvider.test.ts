import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GeminiProvider } from '@/ai/providers/GeminiProvider'
import type { GeminiProviderError } from '@/ai/providers/GeminiProvider'
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
          candidateId: 'ATTRACTION:kiyomizu-dera',
          time: '09:00',
          title: 'Kiyomizu-dera',
          description: 'Explore the historic temple complex.',
          location: 'Higashiyama',
          transport: 'Train',
          estimatedDuration: '2 hours',
          durationMinutes: 120,
          reason: 'Matches the cultural trip style.',
          estimatedCostLocal: 2500,
          estimatedCostUserCurrency: 80,
          currencyLocal: 'JPY',
          currencyUser: 'MYR',
          priceConfidence: 'ESTIMATED_PRICE',
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

const requestWithDestinationContext: GenerateItineraryRequest = {
  ...request,
  durationDays: 1,
  destinationContext: {
    cityId: 'city-1',
    candidateCount: 1,
    omittedCandidateCount: 0,
    serializedSize: 500,
    maxSerializedSize: 6000,
    clusters: [
      {
        id: 'cluster-1',
        centerLatitude: 3.145,
        centerLongitude: 101.695,
        candidateIds: ['ATTRACTION:kiyomizu-dera'],
        averageRankScore: 90,
      },
    ],
    nearestNeighbors: [],
    candidates: [
      {
        id: 'ATTRACTION:kiyomizu-dera',
        type: 'ATTRACTION',
        name: 'Kiyomizu-dera',
        latitude: 35.0,
        longitude: 135.0,
        address: 'Higashiyama',
        categories: ['temple'],
        tags: ['culture'],
        openingHours: [],
        openingHoursStatus: 'UNKNOWN',
        openingHoursKnown: false,
        ticketPrice: {
          amount: 2500,
          currency: 'JPY',
          priceType: 'FIXED',
          confidence: 'KNOWN_PRICE',
        },
        ticketPrices: [],
        ticketPriceStatus: 'VERIFIED',
        priceConfidence: 'KNOWN_PRICE',
        officialUrlStatus: 'UNKNOWN',
        estimatedVisitDurationMinutes: 120,
        source: 'openstreetmap',
        factualCompletenessScore: 80,
        staleFactCount: 0,
        factualStatus: 'UNKNOWN',
        factSourceSummary: [],
        rankScore: 90,
        rankReasons: [],
        enrichmentState: 'SOURCE_ONLY',
      },
    ],
  },
}

function createProvider(
  generateContent: TestGenerateContent,
  overrides: Partial<ConstructorParameters<typeof GeminiProvider>[0]> = {}
) {
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
    delay: vi.fn(async () => undefined),
    random: () => 0,
    ...overrides,
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

    expect(generateContent.mock.calls[0]?.[0].config).not.toHaveProperty('responseJsonSchema')
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-test-model',
        config: expect.objectContaining({
          maxOutputTokens: 1800,
          responseMimeType: 'application/json',
          responseSchema: expect.objectContaining({ required: ['items'] }),
          temperature: 0.2,
          thinkingConfig: {
            includeThoughts: false,
            thinkingBudget: 0,
          },
        }),
      })
    )
  })

  it('caps stale timeout and output-token settings for production latency', async () => {
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({ text: JSON.stringify(validItinerary) })
    const provider = createProvider(generateContent, {
      requestTimeoutMs: 60_000,
      maxOutputTokens: 9_000,
    })

    await expect(provider.generateItinerary(request)).resolves.toEqual(validItinerary)

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          httpOptions: { timeout: 30_000 },
          maxOutputTokens: 2_000,
        }),
      })
    )
  })

  it('expands compact itinerary JSON using supplied destination context', async () => {
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({
        text: JSON.stringify({
          items: [
            {
              candidateId: 'ATTRACTION:kiyomizu-dera',
              day: 1,
              startTime: '09:00',
              durationMinutes: 120,
              reason: 'Best culture match.',
            },
          ],
        }),
      })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(requestWithDestinationContext)).resolves.toMatchObject({
      title: 'Kyoto in 1 day',
      days: [
        expect.objectContaining({
          morning: [
            expect.objectContaining({
              candidateId: 'ATTRACTION:kiyomizu-dera',
              title: 'Kiyomizu-dera',
              estimatedCostLocal: 2500,
              estimatedCostUserCurrency: 80,
              priceConfidence: 'KNOWN_PRICE',
            }),
          ],
        }),
      ],
    })

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseSchema: expect.objectContaining({
            properties: expect.objectContaining({
              items: expect.objectContaining({
                items: expect.objectContaining({
                  properties: expect.objectContaining({
                    candidateId: expect.objectContaining({
                      description: expect.stringContaining('1 supplied destination candidates'),
                    }),
                  }),
                }),
              }),
            }),
          }),
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

  it('respects Retry-After for rate limit backoff and exposes the category after retries', async () => {
    const rateLimitError = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '2' : null) },
    })
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValue(rateLimitError)
    const delay = vi.fn(async () => undefined)
    const provider = createProvider(generateContent, { maxRetries: 1, delay })

    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      retryAfterMs: 2000,
    } satisfies Partial<GeminiProviderError>)

    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledWith(2000)
  })

  it('allows GEMINI_MAX_RETRIES=0 to disable retries for diagnostics', async () => {
    const previousMaxRetries = process.env.GEMINI_MAX_RETRIES
    process.env.GEMINI_MAX_RETRIES = '0'
    try {
      const rateLimitError = Object.assign(new Error('rate limited'), { status: 429 })
      const generateContent = vi
        .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
        .mockRejectedValue(rateLimitError)
      const provider = createProvider(generateContent)

      await expect(provider.generateItinerary(request)).rejects.toMatchObject({
        code: 'AI_RATE_LIMITED',
        diagnostics: expect.objectContaining({
          maxAttempts: 1,
        }),
      } satisfies Partial<GeminiProviderError>)

      expect(generateContent).toHaveBeenCalledTimes(1)
    } finally {
      if (previousMaxRetries === undefined) delete process.env.GEMINI_MAX_RETRIES
      else process.env.GEMINI_MAX_RETRIES = previousMaxRetries
    }
  })

  it('classifies a missing Gemini API key before any provider request', () => {
    const previousApiKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY

    try {
      let error: unknown
      try {
        new GeminiProvider({ model: 'gemini-test-model' })
      } catch (caught) {
        error = caught
      }
      expect(error).toMatchObject({
        code: 'AI_AUTHENTICATION_FAILURE',
        diagnostics: expect.objectContaining({
          responseReceived: false,
          responseParsingState: 'not_started',
        }),
      } satisfies Partial<GeminiProviderError>)
    } finally {
      if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previousApiKey
    }
  })

  it('distinguishes quota exhaustion from generic rate limiting', async () => {
    const quotaError = Object.assign(
      new Error(
        JSON.stringify({
          error: {
            message: 'quota exceeded',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '33s' }],
          },
        })
      ),
      { status: 429 }
    )
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValue(quotaError)
    const delay = vi.fn(async () => undefined)
    const provider = createProvider(generateContent, { maxRetries: 1, delay })

    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      retryAfterMs: 33000,
      diagnostics: expect.objectContaining({
        status: 429,
        responseReceived: false,
        providerMessage: 'quota exceeded',
      }),
    } satisfies Partial<GeminiProviderError>)

    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledWith(33000)
  })

  it('classifies network failures separately from unknown failures', async () => {
    const networkError = new TypeError('fetch failed')
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValue(networkError)
    const provider = createProvider(generateContent, { maxRetries: 1 })

    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_NETWORK_FAILURE',
      diagnostics: expect.objectContaining({
        responseReceived: false,
      }),
    } satisfies Partial<GeminiProviderError>)

    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('retries transient model-unavailable failures and reports the final category', async () => {
    const modelError = Object.assign(new Error('model is unavailable'), { status: 503 })
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValue(modelError)
    const provider = createProvider(generateContent, { maxRetries: 1 })

    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_MODEL_UNAVAILABLE',
      diagnostics: expect.objectContaining({
        status: 503,
        maxAttempts: 2,
      }),
    } satisfies Partial<GeminiProviderError>)

    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('does not retry response-schema request failures', async () => {
    const schemaError = Object.assign(new Error('responseJsonSchema invalid argument'), {
      status: 400,
    })
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockRejectedValue(schemaError)
    const provider = createProvider(generateContent, { maxRetries: 2 })

    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_SCHEMA_VALIDATION_FAILURE',
    } satisfies Partial<GeminiProviderError>)

    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('throws a friendly error when Gemini returns malformed JSON', async () => {
    const generateContent = vi
      .fn<[GenerateContentParameters], Promise<Pick<GenerateContentResponse, 'text'>>>()
      .mockResolvedValue({ text: '```json\nnot-json\n```' })
    const provider = createProvider(generateContent)

    await expect(provider.generateItinerary(request)).rejects.toThrow(
      'Gemini returned malformed itinerary JSON.'
    )
    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    } satisfies Partial<GeminiProviderError>)
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
    await expect(provider.generateItinerary(request)).rejects.toMatchObject({
      code: 'AI_SCHEMA_VALIDATION_FAILURE',
      diagnostics: expect.objectContaining({
        responseReceived: true,
        responseParsingState: 'schema_failed',
      }),
    } satisfies Partial<GeminiProviderError>)
  })
})
