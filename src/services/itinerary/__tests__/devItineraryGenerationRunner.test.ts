import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseDevItineraryGenerationArgs,
  runDevItineraryGenerationCli,
} from '@/services/itinerary/devItineraryGenerationRunner'
import { ItineraryGenerationError } from '@/services/itinerary/itineraryGenerationService'

const summary = {
  tripId: 'trip-1',
  mode: 'dry-run' as const,
  destination: 'Kuala Lumpur',
  cityId: 'city-1',
  cityName: 'Kuala Lumpur',
  eligibleCandidates: 1,
  candidatesSent: 1,
  candidatesOmitted: 0,
  contextRawSerializedSize: 1800,
  contextSerializedSize: 1000,
  contextMaxSerializedSize: 6000,
  generationLatencyMs: 250,
  candidateIds: [{ id: 'ATTRACTION:central-market', type: 'ATTRACTION', name: 'Central Market', rankScore: 88 }],
  candidateTypeCounts: { ATTRACTION: 1, RESTAURANT: 0, HOTEL: 0, ACTIVITY: 0 },
  knownOpeningHoursCount: 0,
  knownPriceCount: 0,
  staleFactCount: 0,
  geminiItemsReturned: 1,
  validItems: 1,
  rejectedItems: 0,
  unknownCandidateIds: [],
  duplicateCandidateIds: [],
  validationStatus: 'PASSED' as const,
  validationIssues: [],
  persisted: false,
  persistenceResult: 'DRY_RUN' as const,
}

describe('dev itinerary generation runner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('defaults to dry-run and parses candidate limit', () => {
    expect(parseDevItineraryGenerationArgs(['--tripId=trip-1', '--maxCandidates=6'])).toEqual({
      tripId: 'trip-1',
      maxCandidates: 6,
      persist: false,
      printContextSummary: false,
    })
  })

  it('refuses conflicting dry-run and persist flags', () => {
    expect(() => parseDevItineraryGenerationArgs(['--tripId=trip-1', '--dry-run', '--persist'])).toThrow(
      'Pass either --dry-run or --persist'
    )
  })

  it('runs the service in dry-run mode by default', async () => {
    const generate = vi.fn().mockResolvedValue({
      summary,
      destinationContext: { candidates: [], clusters: [], nearestNeighbors: [] },
    })

    const exitCode = await runDevItineraryGenerationCli(['--tripId=trip-1'], {
      service: { generate },
      env: { NODE_ENV: 'development' },
    })

    expect(exitCode).toBe(0)
    expect(generate).toHaveBeenCalledWith({
      tripId: 'trip-1',
      maxCandidates: 6,
      persist: false,
    })
  })

  it('passes persist only when explicitly requested', async () => {
    const generate = vi.fn().mockResolvedValue({
      summary: {
        ...summary,
        mode: 'persist',
        persisted: true,
        persistenceResult: 'REPLACED_TRIP_ITINERARY',
      },
      destinationContext: { candidates: [], clusters: [], nearestNeighbors: [] },
    })

    const exitCode = await runDevItineraryGenerationCli(['--tripId=trip-1', '--persist'], {
      service: { generate },
      env: { NODE_ENV: 'development' },
    })

    expect(exitCode).toBe(0)
    expect(generate).toHaveBeenCalledWith({
      tripId: 'trip-1',
      maxCandidates: 6,
      persist: true,
    })
  })

  it('prints recoverable validation errors without throwing', async () => {
    const generate = vi.fn().mockRejectedValue(
      new ItineraryGenerationError(
        'AI_CONTRACT_VIOLATION',
        'Generated itinerary referenced unsupported destination records.',
        422,
        {
          recoverable: true,
          category: 'AI_CONTRACT_VIOLATION',
          previousItineraryPreserved: false,
          details: { ...summary, validationStatus: 'FAILED', validationIssues: ['unknown candidate'] },
        }
      )
    )

    const exitCode = await runDevItineraryGenerationCli(['--tripId=trip-1'], {
      service: { generate },
      env: { NODE_ENV: 'development' },
    })

    expect(exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      '[itinerary:dev] AI_CONTRACT_VIOLATION: Generated itinerary referenced unsupported destination records.'
    )
  })

  it('prints recoverable provider failure summaries without throwing', async () => {
    const generate = vi.fn().mockRejectedValue(
      new ItineraryGenerationError('AI_RATE_LIMITED', 'Gemini quota or rate limit exceeded.', 429, {
        recoverable: true,
        category: 'AI_RATE_LIMITED',
        previousItineraryPreserved: true,
        details: {
          ...summary,
          validationStatus: 'FAILED',
          validationIssues: ['AI provider failed before itinerary validation: AI_RATE_LIMITED'],
        },
      })
    )

    const exitCode = await runDevItineraryGenerationCli(['--tripId=trip-1'], {
      service: { generate },
      env: { NODE_ENV: 'development' },
    })

    expect(exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      '[itinerary:dev] AI_RATE_LIMITED: Gemini quota or rate limit exceeded.'
    )
    expect(console.warn).toHaveBeenCalledWith('  schema/contract validation: FAILED')
  })

  it('refuses to run in production', async () => {
    const generate = vi.fn()

    const exitCode = await runDevItineraryGenerationCli(['--tripId=trip-1'], {
      service: { generate },
      env: { NODE_ENV: 'production' },
    })

    expect(exitCode).toBe(1)
    expect(generate).not.toHaveBeenCalled()
  })
})
