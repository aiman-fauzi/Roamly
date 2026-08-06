import { assertDestinationSourceUsable } from '@/services/destinations/sources/sourceRegistry'

export type DestinationImportFetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface DestinationImportHttpClientOptions {
  fetcher?: DestinationImportFetcher
  userAgent?: string
  requestTimeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
  disableRateLimit?: boolean
  disableCache?: boolean
}

interface CacheEntry {
  text: string
  fetchedAt: Date
}

export interface DestinationImportHttpResponse {
  text: string
  fromCache: boolean
  url: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_BASE_DELAY_MS = 500
const cache = new Map<string, CacheEntry>()
const lastRequestAtBySource = new Map<string, number>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRetryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : null
}

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5))
}

function userAgentFromEnv(): string {
  const contact = process.env.ROAMLY_IMPORT_CONTACT ?? 'contact-unset'
  return `RoamlyDestinationImporter/1.0 (+https://roamly-lemon.vercel.app; contact=${contact})`
}

export class DestinationImportHttpClient {
  private readonly fetcher: DestinationImportFetcher
  private readonly userAgent: string
  private readonly requestTimeoutMs: number
  private readonly maxRetries: number
  private readonly baseDelayMs: number
  private readonly disableRateLimit: boolean
  private readonly disableCache: boolean
  private requestCount = 0

  constructor(options: DestinationImportHttpClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.userAgent = options.userAgent ?? userAgentFromEnv()
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
    this.disableRateLimit = options.disableRateLimit ?? false
    this.disableCache = options.disableCache ?? false
  }

  async get(sourceId: string, url: string, options: { cacheTtlMs?: number } = {}): Promise<DestinationImportHttpResponse> {
    const source = assertDestinationSourceUsable(sourceId)
    const cacheKey = `${sourceId}:${url}`
    const cached = cache.get(cacheKey)
    if (!this.disableCache && cached && options.cacheTtlMs && Date.now() - cached.fetchedAt.getTime() <= options.cacheTtlMs) {
      return { text: cached.text, fromCache: true, url }
    }

    if (!this.disableRateLimit) {
      const minimumSpacingMs = source.rateLimitPerSecond > 0 ? Math.ceil(1000 / source.rateLimitPerSecond) : 0
      const lastRequestAt = lastRequestAtBySource.get(sourceId) ?? 0
      const waitMs = minimumSpacingMs - (Date.now() - lastRequestAt)
      if (waitMs > 0) await sleep(waitMs)
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
      try {
        lastRequestAtBySource.set(sourceId, Date.now())
        this.requestCount += 1
        const response = await this.fetcher(url, {
          headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': this.userAgent,
          },
          signal: controller.signal,
        })

        if (response.status === 429 || response.status >= 500) {
          const retryAfterMs = readRetryAfterMs(response)
          throw new Error(`HTTP ${response.status}${retryAfterMs ? ` retry-after=${retryAfterMs}` : ''}`)
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const text = await response.text()
        if (!this.disableCache) cache.set(cacheKey, { text, fetchedAt: new Date() })
        return { text, fromCache: false, url }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt === this.maxRetries) break
        const retryAfterMatch = /retry-after=(\d+)/.exec(lastError.message)
        const retryAfterMs = retryAfterMatch ? Number(retryAfterMatch[1]) : null
        await sleep(retryAfterMs ?? jitter(this.baseDelayMs * 2 ** attempt))
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`)
  }

  getRequestCount(): number {
    return this.requestCount
  }
}
