import {
  GoogleGenAI,
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema,
} from '@google/genai'
import { z } from 'zod'

import { buildItineraryPrompt } from '@/ai/prompts/itineraryPrompt'
import type {
  AIErrorCategory,
  AIProvider,
  GenerateItineraryRequest,
  GenerateItineraryResponse,
} from '@/ai/types'
import { RequestTiming } from '@/lib/observability/requestTiming'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_BASE_DELAY_MS = 750
const DEFAULT_MAX_OUTPUT_TOKENS = 1_800
const DEFAULT_THINKING_BUDGET = 0
const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_REQUEST_TIMEOUT_MS = 30_000
const MAX_OUTPUT_TOKENS = 2_000
const PROVIDER = 'gemini'
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const itineraryItemSchema = z.object({
  candidateId: z.string().min(1),
  time: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  transport: z.string().min(1),
  estimatedDuration: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(720),
  reason: z.string().min(1),
  estimatedCostLocal: z.number().nonnegative(),
  estimatedCostUserCurrency: z.number().nonnegative(),
  currencyLocal: z.string().min(3),
  currencyUser: z.string().min(3),
  priceConfidence: z.enum(['KNOWN_PRICE', 'ESTIMATED_PRICE', 'PRICE_UNKNOWN']),
  tips: z.array(z.string()),
})

const dayPlanSchema = z.object({
  dayNumber: z.number().int().positive(),
  theme: z.string().min(1),
  morning: z.array(itineraryItemSchema),
  afternoon: z.array(itineraryItemSchema),
  evening: z.array(itineraryItemSchema),
  dailyTotalLocal: z.number().nonnegative(),
  dailyTotalUserCurrency: z.number().nonnegative(),
  notes: z.array(z.string()),
})

const roadmapItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum([
    'attraction',
    'end',
    'hotel',
    'food',
    'transport',
    'activity',
    'restaurant',
    'shopping',
    'start',
    'nightlife',
    'other',
  ]),
  time: z.string().optional(),
})

const richItinerarySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  selectedFlightOfferId: z.string().min(1).optional(),
  selectedHotelOfferId: z.string().min(1).optional(),
  currencyLocal: z.string().min(3),
  currencyUser: z.string().min(3),
  exchangeRate: z.object({
    baseCurrency: z.string().min(3),
    quoteCurrency: z.string().min(3),
    rate: z.number().positive(),
    source: z.string().min(1),
    fetchedAt: z.string().min(1),
    fromCache: z.boolean(),
  }),
  budget: z.object({
    totalBudgetUserCurrency: z.number().nonnegative(),
    estimatedTotalLocal: z.number().nonnegative(),
    estimatedTotalUserCurrency: z.number().nonnegative(),
    remainingBudgetUserCurrency: z.number(),
    isBudgetExceeded: z.boolean(),
  }),
  days: z.array(dayPlanSchema).min(1),
  roadmap: z.array(
    z.object({
      dayNumber: z.number().int().positive(),
      items: z.array(roadmapItemSchema),
    })
  ),
})

const compactItinerarySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            candidateId: z.string().min(1),
            day: z.number().int().positive(),
            startTime: z.string().regex(TIME_PATTERN),
            durationMinutes: z.number().int().min(15).max(720),
            reason: z.string().min(1).max(160),
          })
          .strict()
      )
      .min(1),
  })
  .strict()

const COMPACT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  propertyOrdering: ['items'],
  properties: {
    items: {
      type: Type.ARRAY,
      minItems: '1',
      items: {
        type: Type.OBJECT,
        propertyOrdering: ['candidateId', 'day', 'startTime', 'durationMinutes', 'reason'],
        properties: {
          candidateId: {
            type: Type.STRING,
            description: 'Exact candidateId copied from the supplied destination candidates.',
          },
          day: { type: Type.INTEGER },
          startTime: { type: Type.STRING },
          durationMinutes: { type: Type.INTEGER },
          reason: { type: Type.STRING },
        },
        required: ['candidateId', 'day', 'startTime', 'durationMinutes', 'reason'],
      },
    },
  },
  required: ['items'],
}

function compactResponseSchema(options: {
  allowedCandidateIds?: string[]
  durationDays?: number
}): Schema {
  return {
    ...COMPACT_RESPONSE_SCHEMA,
    properties: {
      items: {
        ...COMPACT_RESPONSE_SCHEMA.properties?.items,
        items: {
          ...COMPACT_RESPONSE_SCHEMA.properties?.items?.items,
          properties: {
            ...COMPACT_RESPONSE_SCHEMA.properties?.items?.items?.properties,
            candidateId: {
              type: Type.STRING,
              description:
                options.allowedCandidateIds && options.allowedCandidateIds.length > 0
                  ? `Exact candidateId copied from one of the ${options.allowedCandidateIds.length} supplied destination candidates.`
                  : 'Exact candidateId copied from the supplied destination candidates.',
            },
          },
        },
      },
    },
  }
}

interface GeminiClient {
  models: {
    generateContent(
      params: GenerateContentParameters
    ): Promise<Pick<GenerateContentResponse, 'text'>>
  }
}

interface GeminiLogMeta {
  provider: typeof PROVIDER
  model: string
  responseTimeMs: number
  errorType?: string
  status?: number
  attempt?: number
  maxAttempts?: number
  retryCount?: number
  requestTimeoutMs?: number
  promptChars?: number
  responseReceived?: boolean
  providerMessage?: string
}

interface GeminiLogger {
  info(message: string, meta: GeminiLogMeta): void
  warn(message: string, meta: GeminiLogMeta): void
  error(message: string, meta: GeminiLogMeta): void
}

interface GeminiProviderOptions {
  apiKey?: string
  model?: string
  client?: GeminiClient
  logger?: GeminiLogger
  requestTimeoutMs?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  maxOutputTokens?: number
  thinkingBudget?: number
  delay?: (ms: number) => Promise<void>
  random?: () => number
}

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCategory = 'AI_UNKNOWN_FAILURE',
    public readonly retryAfterMs?: number,
    public readonly diagnostics?: GeminiProviderDiagnostics
  ) {
    super(message)
    this.name = 'GeminiProviderError'
  }
}

export interface GeminiProviderDiagnostics {
  provider: typeof PROVIDER
  model?: string
  status?: number
  errorCategory: AIErrorCategory
  requestTimeoutMs?: number
  retryCount?: number
  maxAttempts?: number
  promptChars?: number
  responseReceived: boolean
  responseParsingState: 'not_started' | 'received_text' | 'parsed' | 'schema_failed'
  providerMessage?: string
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const maybeStatus = error as { status?: unknown; code?: unknown }
  if (typeof maybeStatus.status === 'number') return maybeStatus.status
  if (typeof maybeStatus.code === 'number') return maybeStatus.code
  return undefined
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeProviderErrorMessage(error: unknown): string | undefined {
  const raw = getErrorMessage(error)
  if (!raw) return undefined

  let message = raw
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown; status?: unknown } }
    if (typeof parsed.error?.message === 'string') {
      message = parsed.error.message
    }
  } catch {
    // The SDK may throw plain Error/TypeError instances; keep their message.
  }

  return message.replace(/\s+/g, ' ').trim().slice(0, 1_000)
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as {
    retryAfter?: unknown
    retryAfterMs?: unknown
    headers?: { get?: (name: string) => string | null } | Record<string, unknown>
    response?: { headers?: { get?: (name: string) => string | null } | Record<string, unknown> }
  }
  if (typeof candidate.retryAfterMs === 'number') return candidate.retryAfterMs
  if (typeof candidate.retryAfter === 'number') return candidate.retryAfter * 1000

  const headers = candidate.headers ?? candidate.response?.headers
  const raw =
    headers && 'get' in headers && typeof headers.get === 'function'
      ? headers.get('retry-after')
      : headers && typeof headers === 'object'
        ? ((headers as Record<string, unknown>)['retry-after'] as string | undefined)
        : undefined
  if (!raw) return getRetryAfterMsFromProviderMessage(error)

  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const dateMs = Date.parse(raw)
  return Number.isFinite(dateMs)
    ? Math.max(0, dateMs - Date.now())
    : getRetryAfterMsFromProviderMessage(error)
}

function retryDelayTextToMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const secondsMatch = value.match(/^(\d+(?:\.\d+)?)s$/)
  if (secondsMatch) return Math.max(0, Math.round(Number(secondsMatch[1]) * 1000))
  const retryInMatch = value.match(/retry in (\d+(?:\.\d+)?)s/i)
  if (retryInMatch) return Math.max(0, Math.round(Number(retryInMatch[1]) * 1000))
  return undefined
}

function getRetryAfterMsFromProviderMessage(error: unknown): number | undefined {
  const raw = getErrorMessage(error)
  const directDelay = retryDelayTextToMs(raw)
  if (directDelay != null) return directDelay

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: unknown
        details?: Array<Record<string, unknown>>
      }
    }
    const messageDelay = retryDelayTextToMs(parsed.error?.message)
    if (messageDelay != null) return messageDelay

    for (const detail of parsed.error?.details ?? []) {
      const retryDelay = retryDelayTextToMs(detail.retryDelay)
      if (retryDelay != null) return retryDelay
    }
  } catch {
    return undefined
  }

  return undefined
}

function isTransientError(error: unknown): boolean {
  if (error instanceof GeminiProviderError) {
    return [
      'AI_TIMEOUT',
      'AI_RATE_LIMITED',
      'AI_QUOTA_EXCEEDED',
      'AI_TEMPORARY_FAILURE',
      'AI_NETWORK_FAILURE',
      'AI_MODEL_UNAVAILABLE',
    ].includes(error.code)
  }
  const status = getErrorStatus(error)
  if (status === 408 || status === 409 || status === 429 || (status && status >= 500)) return true

  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('temporarily') ||
    message.includes('rate') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  )
}

function looksLikeSchemaRequestFailure(status: number | undefined, message: string): boolean {
  return Boolean(
    status === 400 &&
      (message.includes('schema') ||
        message.includes('responsejsonschema') ||
        message.includes('response schema') ||
        message.includes('invalid argument'))
  )
}

function looksLikeModelUnavailable(status: number | undefined, message: string): boolean {
  return Boolean(
    status === 404 ||
      status === 503 ||
      message.includes('model not found') ||
      message.includes('not found for api version') ||
      message.includes('model is unavailable') ||
      message.includes('model unavailable')
  )
}

function looksLikeNetworkFailure(status: number | undefined, message: string): boolean {
  return Boolean(
    !status &&
      (message.includes('fetch failed') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        message.includes('socket') ||
        message.includes('tls'))
  )
}

function toFriendlyError(
  error: unknown,
  diagnostics?: Omit<GeminiProviderDiagnostics, 'errorCategory'>
): GeminiProviderError {
  if (error instanceof GeminiProviderError) return error

  const status = getErrorStatus(error)
  const message = getErrorMessage(error).toLowerCase()
  const retryAfterMs = getRetryAfterMs(error)
  const providerMessage = safeProviderErrorMessage(error)
  const withDiagnostics = (
    friendlyMessage: string,
    code: AIErrorCategory,
    retryMs: number | undefined = retryAfterMs
  ) =>
    new GeminiProviderError(friendlyMessage, code, retryMs, {
      ...(diagnostics ?? {
        provider: PROVIDER,
        responseReceived: false,
        responseParsingState: 'not_started' as const,
      }),
      status,
      errorCategory: code,
      providerMessage,
    })

  if (status === 401 || status === 403 || message.includes('api key')) {
    return withDiagnostics(
      'Gemini API key is invalid, missing, or unauthorized.',
      'AI_AUTHENTICATION_FAILURE'
    )
  }

  if (status === 429 || message.includes('quota') || message.includes('rate')) {
    if (message.includes('quota')) {
      return withDiagnostics('Gemini quota exceeded. Please try again later.', 'AI_QUOTA_EXCEEDED')
    }
    return withDiagnostics('Gemini rate limit exceeded. Please try again later.', 'AI_RATE_LIMITED')
  }

  if (
    status === 408 ||
    status === 504 ||
    message.includes('timeout') ||
    message.includes('aborted')
  ) {
    return withDiagnostics('Gemini request timed out. Please try again.', 'AI_TIMEOUT')
  }

  if (looksLikeSchemaRequestFailure(status, message)) {
    return withDiagnostics(
      'Gemini rejected the requested response schema.',
      'AI_SCHEMA_VALIDATION_FAILURE'
    )
  }

  if (looksLikeModelUnavailable(status, message)) {
    return withDiagnostics('Gemini model is unavailable for this request.', 'AI_MODEL_UNAVAILABLE')
  }

  if (looksLikeNetworkFailure(status, message)) {
    return withDiagnostics(
      'Gemini network request failed before a response was received.',
      'AI_NETWORK_FAILURE'
    )
  }

  if (status && status >= 500) {
    return withDiagnostics(
      'Gemini service is temporarily unavailable. Please try again.',
      'AI_TEMPORARY_FAILURE'
    )
  }

  return withDiagnostics(
    'Gemini failed to generate a response. Please try again.',
    'AI_UNKNOWN_FAILURE'
  )
}

function timeBucket(startTime: string): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(startTime.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function roadmapKind(type: string) {
  if (type === 'ATTRACTION') return 'attraction' as const
  if (type === 'RESTAURANT') return 'restaurant' as const
  if (type === 'HOTEL') return 'hotel' as const
  if (type === 'ACTIVITY') return 'activity' as const
  return 'other' as const
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function compactCandidateCost(
  candidate: NonNullable<GenerateItineraryRequest['destinationContext']>['candidates'][number]
): {
  amount: number
  confidence: 'KNOWN_PRICE' | 'ESTIMATED_PRICE' | 'PRICE_UNKNOWN'
} {
  const price = candidate.ticketPrice
  if (!price || candidate.ticketPriceStatus !== 'VERIFIED') {
    return { amount: 0, confidence: 'PRICE_UNKNOWN' }
  }
  if (price.priceType === 'FREE') return { amount: 0, confidence: 'KNOWN_PRICE' }
  if (typeof price.amount === 'number') return { amount: price.amount, confidence: 'KNOWN_PRICE' }
  if (typeof price.minAmount === 'number')
    return { amount: price.minAmount, confidence: 'KNOWN_PRICE' }
  return { amount: 0, confidence: 'PRICE_UNKNOWN' }
}

function expandCompactItinerary(
  compact: z.infer<typeof compactItinerarySchema>,
  request: GenerateItineraryRequest
): GenerateItineraryResponse {
  const context = request.destinationContext
  if (!context) {
    throw new GeminiProviderError(
      'Gemini returned compact itinerary JSON without destination context.',
      'AI_INVALID_RESPONSE'
    )
  }

  const candidates = new Map(context.candidates.map((candidate) => [candidate.id, candidate]))
  const days = Array.from({ length: request.durationDays }, (_, index) => ({
    dayNumber: index + 1,
    theme: `${request.destination} day ${index + 1}`,
    morning: [] as GenerateItineraryResponse['days'][number]['morning'],
    afternoon: [] as GenerateItineraryResponse['days'][number]['afternoon'],
    evening: [] as GenerateItineraryResponse['days'][number]['evening'],
    dailyTotalLocal: 0,
    dailyTotalUserCurrency: 0,
    notes: [] as string[],
  }))

  for (const item of compact.items) {
    const candidate = candidates.get(item.candidateId)
    const day = days[item.day - 1] ?? {
      dayNumber: item.day,
      theme: `${request.destination} day ${item.day}`,
      morning: [] as GenerateItineraryResponse['days'][number]['morning'],
      afternoon: [] as GenerateItineraryResponse['days'][number]['afternoon'],
      evening: [] as GenerateItineraryResponse['days'][number]['evening'],
      dailyTotalLocal: 0,
      dailyTotalUserCurrency: 0,
      notes: [] as string[],
    }
    if (!days[item.day - 1]) days.push(day)

    const cost = candidate
      ? compactCandidateCost(candidate)
      : { amount: 0, confidence: 'PRICE_UNKNOWN' as const }
    const localAmount = roundMoney(cost.amount)
    const userAmount = roundMoney(localAmount * request.exchangeRate)
    const bucket = timeBucket(item.startTime)
    day[bucket].push({
      candidateId: item.candidateId,
      time: item.startTime,
      title: candidate?.name ?? item.candidateId,
      description: item.reason,
      location: candidate?.address ?? candidate?.name ?? item.candidateId,
      latitude: candidate?.latitude ?? 0,
      longitude: candidate?.longitude ?? 0,
      transport: request.transportationPreference ?? 'Local transport',
      estimatedDuration: `${item.durationMinutes} minutes`,
      durationMinutes: item.durationMinutes,
      reason: item.reason,
      estimatedCostLocal: localAmount,
      estimatedCostUserCurrency: userAmount,
      currencyLocal: request.destinationCurrency,
      currencyUser: request.userCurrency,
      priceConfidence: cost.confidence,
      tips: candidate?.openingHoursKnown ? [] : ['Verify current hours before visiting.'],
    })
    day.dailyTotalLocal = roundMoney(day.dailyTotalLocal + localAmount)
    day.dailyTotalUserCurrency = roundMoney(day.dailyTotalUserCurrency + userAmount)
  }

  const estimatedTotalLocal = roundMoney(
    days.reduce((total, day) => total + day.dailyTotalLocal, 0)
  )
  const estimatedTotalUserCurrency = roundMoney(
    days.reduce((total, day) => total + day.dailyTotalUserCurrency, 0)
  )
  const totalBudgetUserCurrency = request.budgetSummary
    ? Number(request.budgetSummary.total.userBudget?.amount ?? request.budget)
    : request.budget

  return {
    title: `${request.destination} in ${request.durationDays} day${request.durationDays === 1 ? '' : 's'}`,
    summary: `A compact ${request.durationDays}-day itinerary using vetted destination records from Roamly.`,
    selectedFlightOfferId: request.travelOffersContext?.selectedFlightOfferId,
    selectedHotelOfferId: request.travelOffersContext?.selectedHotelOfferId,
    currencyLocal: request.destinationCurrency,
    currencyUser: request.userCurrency,
    exchangeRate: {
      baseCurrency: request.destinationCurrency,
      quoteCurrency: request.userCurrency,
      rate: request.exchangeRate,
      source: request.exchangeRateSource,
      fetchedAt: request.exchangeRateFetchedAt,
      fromCache: request.exchangeRateFromCache,
    },
    budget: {
      totalBudgetUserCurrency,
      estimatedTotalLocal,
      estimatedTotalUserCurrency,
      remainingBudgetUserCurrency: roundMoney(totalBudgetUserCurrency - estimatedTotalUserCurrency),
      isBudgetExceeded: estimatedTotalUserCurrency > totalBudgetUserCurrency,
    },
    days,
    roadmap: days.map((day) => ({
      dayNumber: day.dayNumber,
      items: [...day.morning, ...day.afternoon, ...day.evening]
        .sort((first, second) => first.time.localeCompare(second.time))
        .map((item) => {
          const candidate = candidates.get(item.candidateId)
          return {
            label: item.title,
            kind: candidate ? roadmapKind(candidate.type) : 'other',
            time: item.time,
          }
        }),
    })),
  }
}

function parseItineraryJson(
  rawText: string,
  request: GenerateItineraryRequest
): GenerateItineraryResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new GeminiProviderError(
      'Gemini returned malformed itinerary JSON.',
      'AI_INVALID_RESPONSE'
    )
  }

  const compactResult = compactItinerarySchema.safeParse(parsed)
  if (compactResult.success) {
    return expandCompactItinerary(compactResult.data, request)
  }

  const result = richItinerarySchema.safeParse(parsed)
  if (!result.success) {
    const issues = [...compactResult.error.issues, ...result.error.issues]
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ')
    throw new GeminiProviderError(
      `Gemini returned itinerary JSON with missing or invalid fields. ${issues}`,
      'AI_SCHEMA_VALIDATION_FAILURE'
    )
  }

  return result.data
}

export class GeminiProvider implements AIProvider {
  private readonly client: GeminiClient
  private readonly model: string
  private readonly logger: GeminiLogger
  private readonly requestTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly maxOutputTokens: number
  private readonly thinkingBudget: number
  private readonly delay: (ms: number) => Promise<void>
  private readonly random: () => number

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey && !options.client) {
      throw new GeminiProviderError(
        'Gemini API key is missing.',
        'AI_AUTHENTICATION_FAILURE',
        undefined,
        {
          provider: PROVIDER,
          model: options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
          errorCategory: 'AI_AUTHENTICATION_FAILURE',
          responseReceived: false,
          responseParsingState: 'not_started',
        }
      )
    }

    const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL
    if (!model) {
      throw new GeminiProviderError('Gemini model is missing.', 'AI_MODEL_UNAVAILABLE', undefined, {
        provider: PROVIDER,
        errorCategory: 'AI_MODEL_UNAVAILABLE',
        responseReceived: false,
        responseParsingState: 'not_started',
      })
    }

    this.model = model
    this.client = options.client ?? new GoogleGenAI({ apiKey: apiKey! })
    this.logger = options.logger ?? console
    this.requestTimeoutMs = Math.min(
      MAX_REQUEST_TIMEOUT_MS,
      options.requestTimeoutMs ??
        readPositiveInteger(process.env.GEMINI_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS)
    )
    this.maxRetries = Math.min(
      2,
      options.maxRetries ??
        readNonNegativeInteger(process.env.GEMINI_MAX_RETRIES, DEFAULT_MAX_RETRIES)
    )
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ??
      readPositiveInteger(process.env.GEMINI_RETRY_BASE_DELAY_MS, DEFAULT_RETRY_BASE_DELAY_MS)
    this.maxOutputTokens = Math.min(
      MAX_OUTPUT_TOKENS,
      options.maxOutputTokens ??
        readPositiveInteger(process.env.GEMINI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
    )
    this.thinkingBudget =
      options.thinkingBudget ??
      readInteger(process.env.GEMINI_THINKING_BUDGET, DEFAULT_THINKING_BUDGET)
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.random = options.random ?? Math.random
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.sendPrompt(prompt, false)
    return this.readText(response)
  }

  async generateJson(
    prompt: string,
    responseSchema: Schema = COMPACT_RESPONSE_SCHEMA
  ): Promise<string> {
    const jsonPrompt = [
      prompt,
      '',
      'Return ONLY valid JSON.',
      'Do not include markdown.',
      'Do not include explanations.',
      'Do not include code fences.',
    ].join('\n')

    const response = await this.sendPrompt(jsonPrompt, true, responseSchema)
    return this.readText(response)
  }

  async generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse> {
    const timing = new RequestTiming('gemini_invocation', request.observabilityRequestId)
    const prompt = buildItineraryPrompt(request)
    try {
      const rawText = await this.generateJson(
        prompt,
        compactResponseSchema({
          allowedCandidateIds: request.destinationContext?.candidates.map(
            (candidate) => candidate.id
          ),
          durationDays: request.durationDays,
        })
      )
      const itinerary = parseItineraryJson(rawText, request)
      timing.finish({ statusCode: 200 })
      return itinerary
    } catch (error) {
      timing.finish({
        statusCode:
          error instanceof GeminiProviderError &&
          (error.code === 'AI_RATE_LIMITED' || error.code === 'AI_QUOTA_EXCEEDED')
            ? 429
            : 500,
        errorCode: error instanceof GeminiProviderError ? error.code : 'AI_INVALID_RESPONSE',
      })
      if (error instanceof GeminiProviderError && !error.diagnostics) {
        throw new GeminiProviderError(error.message, error.code, error.retryAfterMs, {
          provider: PROVIDER,
          model: this.model,
          errorCategory: error.code,
          requestTimeoutMs: this.requestTimeoutMs,
          retryCount: 0,
          maxAttempts: this.maxRetries + 1,
          promptChars: prompt.length,
          responseReceived: true,
          responseParsingState:
            error.code === 'AI_SCHEMA_VALIDATION_FAILURE' ? 'schema_failed' : 'received_text',
        })
      }
      throw error
    }
  }

  private async sendPrompt(
    prompt: string,
    jsonResponse: boolean,
    responseSchema: Schema = COMPACT_RESPONSE_SCHEMA
  ): Promise<Pick<GenerateContentResponse, 'text'>> {
    const startedAt = Date.now()
    const params: GenerateContentParameters = {
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: this.maxOutputTokens,
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: this.thinkingBudget,
        },
        httpOptions: { timeout: this.requestTimeoutMs },
        ...(jsonResponse
          ? {
              responseMimeType: 'application/json',
              responseSchema,
            }
          : {}),
      },
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.models.generateContent(params)
        this.logger.info('AI provider completed', {
          provider: PROVIDER,
          model: this.model,
          responseTimeMs: Date.now() - startedAt,
          attempt: attempt + 1,
          maxAttempts: this.maxRetries + 1,
          retryCount: attempt,
          requestTimeoutMs: this.requestTimeoutMs,
          promptChars: prompt.length,
          responseReceived: true,
        })
        return response
      } catch (error) {
        const friendlyError = toFriendlyError(error, {
          provider: PROVIDER,
          model: this.model,
          status: getErrorStatus(error),
          requestTimeoutMs: this.requestTimeoutMs,
          retryCount: attempt,
          maxAttempts: this.maxRetries + 1,
          promptChars: prompt.length,
          responseReceived: false,
          responseParsingState: 'not_started',
        })
        if (attempt < this.maxRetries && isTransientError(error)) {
          this.logger.warn('AI provider retrying transient failure', {
            provider: PROVIDER,
            model: this.model,
            responseTimeMs: Date.now() - startedAt,
            errorType: friendlyError.code,
            status: getErrorStatus(error),
            attempt: attempt + 1,
            maxAttempts: this.maxRetries + 1,
            retryCount: attempt,
            requestTimeoutMs: this.requestTimeoutMs,
            promptChars: prompt.length,
            responseReceived: false,
          })
          await this.delay(
            retryDelayMs(attempt, this.retryBaseDelayMs, this.random, friendlyError.retryAfterMs)
          )
          continue
        }

        this.logger.error('AI provider failed', {
          provider: PROVIDER,
          model: this.model,
          responseTimeMs: Date.now() - startedAt,
          errorType: friendlyError.code,
          status: getErrorStatus(error),
          attempt: attempt + 1,
          maxAttempts: this.maxRetries + 1,
          retryCount: attempt,
          requestTimeoutMs: this.requestTimeoutMs,
          promptChars: prompt.length,
          responseReceived: false,
        })
        throw friendlyError
      }
    }

    throw new GeminiProviderError(
      'Gemini failed to generate a response. Please try again.',
      'AI_UNKNOWN_FAILURE'
    )
  }

  private readText(response: Pick<GenerateContentResponse, 'text'>): string {
    const text = response.text?.trim() ?? ''
    if (!text) {
      throw new GeminiProviderError('Gemini returned an empty response.', 'AI_INVALID_RESPONSE')
    }

    return text
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function readInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number,
  retryAfterMs?: number
): number {
  if (retryAfterMs != null) return retryAfterMs
  const exponential = baseDelayMs * 2 ** attempt
  const jitter = Math.round(exponential * 0.25 * random())
  return exponential + jitter
}
