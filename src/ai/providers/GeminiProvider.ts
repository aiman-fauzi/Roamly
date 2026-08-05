import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai'
import { z } from 'zod'

import { buildItineraryPrompt } from '@/ai/prompts/itineraryPrompt'
import type {
  AIErrorCategory,
  AIProvider,
  GenerateItineraryRequest,
  GenerateItineraryResponse,
} from '@/ai/types'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 1
const DEFAULT_RETRY_BASE_DELAY_MS = 750
const PROVIDER = 'gemini'

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

const itinerarySchema = z.object({
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

interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<Pick<GenerateContentResponse, 'text'>>
  }
}

interface GeminiLogMeta {
  provider: typeof PROVIDER
  model: string
  responseTimeMs: number
  errorType?: string
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
  delay?: (ms: number) => Promise<void>
  random?: () => number
}

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCategory = 'AI_UNKNOWN_FAILURE',
    public readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'GeminiProviderError'
  }
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
  if (!raw) return undefined

  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const dateMs = Date.parse(raw)
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined
}

function isTransientError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status === 408 || status === 409 || status === 429 || (status && status >= 500)) return true

  const message = getErrorMessage(error).toLowerCase()
  return message.includes('timeout') || message.includes('temporarily') || message.includes('rate')
}

function toFriendlyError(error: unknown): GeminiProviderError {
  if (error instanceof GeminiProviderError) return error

  const status = getErrorStatus(error)
  const message = getErrorMessage(error).toLowerCase()
  const retryAfterMs = getRetryAfterMs(error)

  if (status === 401 || status === 403 || message.includes('api key')) {
    return new GeminiProviderError('Gemini API key is invalid or unauthorized.', 'AI_AUTHENTICATION_FAILED')
  }

  if (status === 429 || message.includes('quota') || message.includes('rate')) {
    return new GeminiProviderError(
      'Gemini quota or rate limit exceeded. Please try again later.',
      'AI_RATE_LIMITED',
      retryAfterMs
    )
  }

  if (status === 408 || status === 504 || message.includes('timeout') || message.includes('aborted')) {
    return new GeminiProviderError('Gemini request timed out. Please try again.', 'AI_TIMEOUT', retryAfterMs)
  }

  if (status && status >= 500) {
    return new GeminiProviderError(
      'Gemini service is temporarily unavailable. Please try again.',
      'AI_TEMPORARY_FAILURE',
      retryAfterMs
    )
  }

  return new GeminiProviderError('Gemini failed to generate a response. Please try again.', 'AI_UNKNOWN_FAILURE')
}

function parseItineraryJson(rawText: string): GenerateItineraryResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new GeminiProviderError('Gemini returned malformed itinerary JSON.', 'AI_INVALID_RESPONSE')
  }

  const result = itinerarySchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ')
    throw new GeminiProviderError(
      `Gemini returned itinerary JSON with missing or invalid fields. ${issues}`,
      'AI_INVALID_RESPONSE'
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
  private readonly delay: (ms: number) => Promise<void>
  private readonly random: () => number

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey && !options.client) {
      throw new GeminiProviderError('Gemini API key is missing.')
    }

    const model = options.model ?? process.env.GEMINI_MODEL
    if (!model) {
      throw new GeminiProviderError('Gemini model is missing.')
    }

    this.model = model
    this.client = options.client ?? new GoogleGenAI({ apiKey: apiKey! })
    this.logger = options.logger ?? console
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? readPositiveInteger(process.env.GEMINI_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS)
    this.maxRetries = Math.min(
      3,
      options.maxRetries ?? readPositiveInteger(process.env.GEMINI_MAX_RETRIES, DEFAULT_MAX_RETRIES)
    )
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ??
      readPositiveInteger(process.env.GEMINI_RETRY_BASE_DELAY_MS, DEFAULT_RETRY_BASE_DELAY_MS)
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.random = options.random ?? Math.random
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.sendPrompt(prompt, false)
    return this.readText(response)
  }

  async generateJson(prompt: string): Promise<string> {
    const jsonPrompt = [
      prompt,
      '',
      'Return ONLY valid JSON.',
      'Do not include markdown.',
      'Do not include explanations.',
      'Do not include code fences.',
    ].join('\n')

    const response = await this.sendPrompt(jsonPrompt, true)
    return this.readText(response)
  }

  async generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse> {
    const rawText = await this.generateJson(buildItineraryPrompt(request))
    return parseItineraryJson(rawText)
  }

  private async sendPrompt(
    prompt: string,
    jsonResponse: boolean
  ): Promise<Pick<GenerateContentResponse, 'text'>> {
    const startedAt = Date.now()
    const params: GenerateContentParameters = {
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.7,
        httpOptions: { timeout: this.requestTimeoutMs },
        ...(jsonResponse ? { responseMimeType: 'application/json' } : {}),
      },
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.models.generateContent(params)
        this.logger.info('AI provider completed', {
          provider: PROVIDER,
          model: this.model,
          responseTimeMs: Date.now() - startedAt,
        })
        return response
      } catch (error) {
        const friendlyError = toFriendlyError(error)
        if (attempt < this.maxRetries && isTransientError(error)) {
          this.logger.warn('AI provider retrying transient failure', {
            provider: PROVIDER,
            model: this.model,
            responseTimeMs: Date.now() - startedAt,
            errorType: friendlyError.code,
          })
          await this.delay(retryDelayMs(attempt, this.retryBaseDelayMs, this.random, friendlyError.retryAfterMs))
          continue
        }

        this.logger.error('AI provider failed', {
          provider: PROVIDER,
          model: this.model,
          responseTimeMs: Date.now() - startedAt,
          errorType: friendlyError.code,
        })
        throw friendlyError
      }
    }

    throw new GeminiProviderError('Gemini failed to generate a response. Please try again.', 'AI_UNKNOWN_FAILURE')
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
