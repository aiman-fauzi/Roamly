import type { OperationMetric } from '@/lib/observability/requestTiming'

export interface OperationSummary {
  operation: string
  requests: number
  successes: number
  failures: number
  fallbacks: number
  medianMs: number
  p95Ms: number
  maxMs: number
  cacheHitRate: number | null
}

export interface TravelMetricSummary {
  operations: OperationSummary[]
  byErrorCode: Record<string, number>
  byRegion: Record<string, number>
}

function percentile(values: number[], value: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.min(sorted.length - 1, Math.ceil(value * sorted.length) - 1)]
}

export function parseOperationMetrics(input: string): OperationMetric[] {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<OperationMetric>
        return parsed.event === 'roamly_operation' && typeof parsed.operation === 'string'
          ? [parsed as OperationMetric]
          : []
      } catch {
        return []
      }
    })
}

export function summarizeTravelMetrics(metrics: OperationMetric[]): TravelMetricSummary {
  const grouped = new Map<string, OperationMetric[]>()
  const byErrorCode: Record<string, number> = {}
  const byRegion: Record<string, number> = {}

  for (const metric of metrics) {
    grouped.set(metric.operation, [...(grouped.get(metric.operation) ?? []), metric])
    byRegion[metric.region] = (byRegion[metric.region] ?? 0) + 1
    if (metric.errorCode) byErrorCode[metric.errorCode] = (byErrorCode[metric.errorCode] ?? 0) + 1
  }

  const operations = [...grouped.entries()]
    .map(([operation, entries]) => {
      const durations = entries.map((entry) => entry.durationMs)
      const cacheable = entries.filter((entry) => entry.cacheStatus !== 'not_applicable')
      const cacheHits = cacheable.filter((entry) => entry.cacheStatus === 'hit').length
      return {
        operation,
        requests: entries.length,
        successes: entries.filter((entry) => entry.status === 'success').length,
        failures: entries.filter((entry) => entry.status === 'failure').length,
        fallbacks: entries.filter((entry) => entry.status === 'fallback').length,
        medianMs: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maxMs: Math.max(...durations),
        cacheHitRate:
          cacheable.length === 0 ? null : Number((cacheHits / cacheable.length).toFixed(4)),
      }
    })
    .sort((first, second) => first.operation.localeCompare(second.operation))

  return { operations, byErrorCode, byRegion }
}
