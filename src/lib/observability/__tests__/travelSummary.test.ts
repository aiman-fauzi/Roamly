import { describe, expect, it } from 'vitest'

import { parseOperationMetrics, summarizeTravelMetrics } from '../travelSummary'

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: 'roamly_operation',
    operation: 'travel_selection_get',
    requestId: 'request-1',
    durationMs: 100,
    status: 'success',
    statusCode: 200,
    region: 'sin1',
    cacheStatus: 'hit',
    errorCode: null,
    runtimeState: 'warm',
    ...overrides,
  })
}

describe('travel observability summary', () => {
  it('ignores unrelated lines and reports latency, outcomes, cache, errors, and regions', () => {
    const input = [
      'plain application log',
      event(),
      event({ requestId: 'request-2', durationMs: 500, status: 'fallback', cacheStatus: 'miss' }),
      event({ requestId: 'request-3', durationMs: 900, status: 'failure', statusCode: 500, cacheStatus: 'not_applicable', errorCode: 'FAILED' }),
    ].join('\n')

    expect(summarizeTravelMetrics(parseOperationMetrics(input))).toEqual({
      operations: [
        {
          operation: 'travel_selection_get',
          requests: 3,
          successes: 1,
          failures: 1,
          fallbacks: 1,
          medianMs: 500,
          p95Ms: 900,
          maxMs: 900,
          cacheHitRate: 0.5,
        },
      ],
      byErrorCode: { FAILED: 1 },
      byRegion: { sin1: 3 },
    })
  })
})
