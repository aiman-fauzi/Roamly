import { randomUUID } from 'node:crypto'

type TimingOutcome = 'success' | 'error'

function elapsedMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(1))
}

function safeMetricName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export class RequestTiming {
  readonly requestId = randomUUID()
  private readonly startedAt = performance.now()
  private readonly components = new Map<string, number>()
  private finished = false

  constructor(readonly operation: string) {}

  async measure<T>(component: string, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
      return await work()
    } finally {
      this.components.set(component, elapsedMs(startedAt))
    }
  }

  measureSync<T>(component: string, work: () => T): T {
    const startedAt = performance.now()
    try {
      return work()
    } finally {
      this.components.set(component, elapsedMs(startedAt))
    }
  }

  record(component: string, durationMs: number): void {
    this.components.set(component, Number(durationMs.toFixed(1)))
  }

  serverTiming(): string {
    const metrics = [...this.components.entries()].map(
      ([name, duration]) => `${safeMetricName(name)};dur=${duration}`
    )
    metrics.push(`total;dur=${elapsedMs(this.startedAt)}`)
    return metrics.join(', ')
  }

  finish(outcome: TimingOutcome): void {
    if (this.finished) return
    this.finished = true
    const event = {
      event: 'trusted_travel_timing',
      requestId: this.requestId,
      operation: this.operation,
      outcome,
      totalDurationMs: elapsedMs(this.startedAt),
      components: Object.fromEntries(this.components),
    }
    // Structured operational timing only; no cookies, tokens, emails, payloads, or database details.
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(event))
  }
}
