import { createHash } from 'node:crypto'

export interface OfferCacheEntry<T> {
  value: T
  fetchedAt: Date
  expiresAt: Date
}

export interface OfferCacheLookup<T> extends OfferCacheEntry<T> {
  cacheStatus: 'HIT' | 'MISS' | 'REFRESHED'
}

export interface OfferCacheStore<T> {
  get(key: string, now?: Date): OfferCacheEntry<T> | null
  getOrSet(
    key: string,
    loader: () => Promise<T>,
    options: OfferCacheOptions
  ): Promise<OfferCacheLookup<T>>
  clear(): void
}

export interface OfferCacheOptions {
  ttlSeconds: number
  now?: Date
  refresh?: boolean
  maxPayloadBytes?: number
}

export interface InMemoryOfferCacheOptions {
  maxEntries?: number
}

interface PendingEntry<T> {
  promise: Promise<OfferCacheLookup<T>>
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`
}

export function buildOfferSearchFingerprint(input: unknown): string {
  return createHash('sha256').update(stableJson(input)).digest('hex')
}

function payloadSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

export class InMemoryOfferCache<T> implements OfferCacheStore<T> {
  private readonly entries = new Map<string, OfferCacheEntry<T>>()
  private readonly pending = new Map<string, PendingEntry<T>>()

  constructor(private readonly options: InMemoryOfferCacheOptions = {}) {}

  private maxEntries(): number {
    return Math.max(1, this.options.maxEntries ?? 64)
  }

  private evictExpired(now: Date): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  private enforceBound(): void {
    while (this.entries.size >= this.maxEntries()) {
      const oldestKey = this.entries.keys().next().value as string | undefined
      if (!oldestKey) break
      this.entries.delete(oldestKey)
    }
  }

  get(key: string, now = new Date()): OfferCacheEntry<T> | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return null
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return { ...entry, value: cloneValue(entry.value) }
  }

  async getOrSet(
    key: string,
    loader: () => Promise<T>,
    options: OfferCacheOptions
  ): Promise<OfferCacheLookup<T>> {
    const now = options.now ?? new Date()
    const cached = options.refresh ? null : this.get(key, now)
    if (cached) return { ...cached, cacheStatus: 'HIT' }

    const pending = this.pending.get(key)
    if (pending && !options.refresh) {
      return pending.promise.then((entry) => ({ ...entry, value: cloneValue(entry.value) }))
    }

    const promise = loader()
      .then((value) => {
        if (options.maxPayloadBytes != null && payloadSizeBytes(value) > options.maxPayloadBytes) {
          throw new Error(`Offer cache payload exceeded ${options.maxPayloadBytes} bytes.`)
        }
        const fetchedAt = options.now ?? new Date()
        const expiresAt = new Date(fetchedAt.getTime() + options.ttlSeconds * 1000)
        this.evictExpired(fetchedAt)
        this.entries.delete(key)
        this.enforceBound()
        const entry = { value: cloneValue(value), fetchedAt, expiresAt }
        this.entries.set(key, entry)
        return {
          ...entry,
          value: cloneValue(entry.value),
          cacheStatus: options.refresh ? ('REFRESHED' as const) : ('MISS' as const),
        }
      })
      .finally(() => {
        this.pending.delete(key)
      })

    this.pending.set(key, { promise })
    return promise
  }

  clear(): void {
    this.entries.clear()
    this.pending.clear()
  }
}
