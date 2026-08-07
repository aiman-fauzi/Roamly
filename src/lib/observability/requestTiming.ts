import { randomUUID } from 'node:crypto'

export type OperationStatus = 'success' | 'failure' | 'fallback'
export type OperationCacheStatus = 'hit' | 'miss' | 'coalesced' | 'not_applicable'
export type RuntimeState = 'cold' | 'warm'

export interface OperationMetric {
  event: 'roamly_operation'
  operation: string
  requestId: string
  durationMs: number
  status: OperationStatus
  statusCode: number
  region: string
  cacheStatus: OperationCacheStatus
  errorCode: string | null
  runtimeState: RuntimeState
  resultCount: number | null
}

export const TRAVEL_LATENCY_THRESHOLDS_MS = {
  travel_selection_get: { warning: 2_000, critical: 5_000 },
  travel_selection_put: { warning: 3_000, critical: 6_000 },
  travel_planning_preview_get: { warning: 4_000, critical: 8_000 },
  gemini_invocation: { warning: 15_000, critical: 30_000 },
} as const

let runtimeHasHandledRequest = false

function elapsedMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(1))
}

function safeMetricName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function operationRegion(): string {
  return process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? 'local'
}

function statusForCode(statusCode: number): OperationStatus {
  return statusCode >= 400 ? 'failure' : 'success'
}

function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number' && Number.isInteger(status)) return status
  }
  return 500
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && /^[A-Z0-9_]{2,80}$/.test(code)) return code
  }
  return 'UNEXPECTED_ERROR'
}

export function emitOperationMetric(metric: Omit<OperationMetric, 'event'>): void {
  // Operational fields only. Never add user, trip, offer, prompt, token, or payload data here.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ event: 'roamly_operation', ...metric } satisfies OperationMetric))
}

export interface TimingCompletion {
  status?: OperationStatus
  statusCode: number
  cacheStatus?: OperationCacheStatus
  errorCode?: string | null
}

export class RequestTiming {
  readonly requestId: string
  private readonly startedAt = performance.now()
  private readonly components = new Map<string, number>()
  private readonly runtimeState: RuntimeState
  private readonly region = operationRegion()
  private cacheStatus: OperationCacheStatus = 'not_applicable'
  private finished = false
  private resultCount: number | null = null

  constructor(readonly operation: string, requestId: string = randomUUID()) {
    this.requestId = requestId
    this.runtimeState = runtimeHasHandledRequest ? 'warm' : 'cold'
    runtimeHasHandledRequest = true
  }

  async measure<T>(component: string, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
      const result = await work()
      const durationMs = elapsedMs(startedAt)
      this.components.set(component, durationMs)
      this.emitComponent(component, durationMs, 200, null)
      return result
    } catch (error) {
      const durationMs = elapsedMs(startedAt)
      this.components.set(component, durationMs)
      this.emitComponent(component, durationMs, errorStatus(error), errorCode(error))
      throw error
    }
  }

  measureSync<T>(component: string, work: () => T): T {
    const startedAt = performance.now()
    try {
      const result = work()
      const durationMs = elapsedMs(startedAt)
      this.components.set(component, durationMs)
      this.emitComponent(component, durationMs, 200, null)
      return result
    } catch (error) {
      const durationMs = elapsedMs(startedAt)
      this.components.set(component, durationMs)
      this.emitComponent(component, durationMs, errorStatus(error), errorCode(error))
      throw error
    }
  }

  record(component: string, durationMs: number): void {
    this.components.set(component, Number(durationMs.toFixed(1)))
  }

  setCacheStatus(status: OperationCacheStatus): void {
    const precedence: OperationCacheStatus[] = ['not_applicable', 'hit', 'coalesced', 'miss']
    if (precedence.indexOf(status) > precedence.indexOf(this.cacheStatus)) this.cacheStatus = status
  }

  setResultCount(count: number): void {
    if (Number.isInteger(count) && count >= 0) this.resultCount = count
  }

  serverTiming(): string {
    const metrics = [...this.components.entries()].map(
      ([name, duration]) => `${safeMetricName(name)};dur=${duration}`
    )
    metrics.push(`total;dur=${elapsedMs(this.startedAt)}`)
    return metrics.join(', ')
  }

  finish(completion: TimingCompletion | 'success' | 'error'): void {
    if (this.finished) return
    this.finished = true
    const normalized: TimingCompletion =
      typeof completion === 'string'
        ? { statusCode: completion === 'success' ? 200 : 500 }
        : completion
    emitOperationMetric({
      operation: this.operation,
      requestId: this.requestId,
      durationMs: elapsedMs(this.startedAt),
      status: normalized.status ?? statusForCode(normalized.statusCode),
      statusCode: normalized.statusCode,
      region: this.region,
      cacheStatus: normalized.cacheStatus ?? this.cacheStatus,
      errorCode: normalized.errorCode ?? null,
      runtimeState: this.runtimeState,
      resultCount: this.resultCount,
    })
  }

  private emitComponent(
    operation: string,
    durationMs: number,
    statusCode: number,
    failureCode: string | null
  ): void {
    emitOperationMetric({
      operation,
      requestId: this.requestId,
      durationMs,
      status: statusForCode(statusCode),
      statusCode,
      region: this.region,
      cacheStatus: 'not_applicable',
      errorCode: failureCode,
      runtimeState: this.runtimeState,
      resultCount: null,
    })
  }
}
