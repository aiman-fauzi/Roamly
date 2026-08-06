import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

import { createClient } from '@/lib/supabase/server'
import {
  ItineraryGenerationError,
  ItineraryGenerationService,
} from '@/services/itinerary/itineraryGenerationService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({
  generate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/itinerary/itineraryGenerationService', () => {
  class MockItineraryGenerationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
      this.name = 'ItineraryGenerationError'
    }
  }

  return {
    ItineraryGenerationError: MockItineraryGenerationError,
    ItineraryGenerationService: vi.fn(() => ({ generate: routeMocks.generate })),
  }
})

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

describe('destination-aware itinerary generation route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
          error: null,
        }),
      },
    } as never)
    vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    routeMocks.generate.mockResolvedValue({
      trip: { id: 'trip-1' },
      itinerary: { title: 'Kuala Lumpur in One Day' },
      summary: {
        eligibleCandidates: 1,
        candidatesSent: 1,
        candidatesOmitted: 0,
      },
    })
  })

  it('delegates authenticated generation to the shared service', async () => {
    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(ItineraryGenerationService).toHaveBeenCalledTimes(1)
    expect(routeMocks.generate).toHaveBeenCalledWith({
      tripId: 'trip-1',
      userId: 'user-1',
      persist: true,
      timing: expect.anything(),
    })
    expect(body.destinationContext).toMatchObject({
      eligibleCandidates: 1,
      candidatesSentToGemini: 1,
      omittedCandidates: 0,
    })
  })

  it('maps unsupported candidate contract errors to a distinct route message', async () => {
    routeMocks.generate.mockRejectedValue(
      new ItineraryGenerationError(
        'AI_CONTRACT_VIOLATION',
        'Generated itinerary referenced unsupported destination records.',
        422,
        {
          recoverable: true,
          category: 'AI_CONTRACT_VIOLATION',
          previousItineraryPreserved: true,
          details: {
            unsupportedCandidateIds: ['ATTRACTION:unknown'],
            validationIssues: ['unknown candidate'],
          },
        }
      )
    )

    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.code).toBe('AI_CONTRACT_VIOLATION')
    expect(body.error).toBe(
      'The itinerary generator referenced a destination Roamly did not offer. Please try again.'
    )
    expect(body.details).toMatchObject({
      recoverable: true,
      category: 'AI_CONTRACT_VIOLATION',
      previousItineraryPreserved: true,
    })
    expect(JSON.stringify(body)).not.toContain('rawText')
  })

  it('maps duplicate candidate contract errors to a distinct route message', async () => {
    routeMocks.generate.mockRejectedValue(
      new ItineraryGenerationError(
        'AI_CONTRACT_VIOLATION',
        'Generated itinerary referenced unsupported destination records.',
        422,
        {
          recoverable: true,
          category: 'AI_CONTRACT_VIOLATION',
          previousItineraryPreserved: true,
          details: {
            duplicateCandidateIds: ['RESTAURANT:duplicate'],
            validationIssues: ['Candidate RESTAURANT:duplicate is duplicated in the itinerary'],
          },
        }
      )
    )

    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.code).toBe('AI_CONTRACT_VIOLATION')
    expect(body.error).toBe('The itinerary generator reused a destination. Please try again.')
  })

  it('distinguishes rate limiting as a recoverable route response', async () => {
    routeMocks.generate.mockRejectedValue(
      new ItineraryGenerationError(
        'AI_RATE_LIMITED',
        'Gemini quota or rate limit exceeded. Please try again later.',
        429,
        {
          recoverable: true,
          category: 'AI_RATE_LIMITED',
          previousItineraryPreserved: true,
          retryAfterMs: 10_000,
        }
      )
    )

    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.code).toBe('AI_RATE_LIMITED')
    expect(body.error).toBe(
      'Itinerary generation is temporarily rate limited. Please try again shortly.'
    )
    expect(body.details).toMatchObject({
      recoverable: true,
      category: 'AI_RATE_LIMITED',
      previousItineraryPreserved: true,
      retryAfterMs: 10_000,
    })
  })

  it('distinguishes AI timeouts as a recoverable route response', async () => {
    routeMocks.generate.mockRejectedValue(
      new ItineraryGenerationError('AI_TIMEOUT', 'Gemini request timed out.', 503, {
        recoverable: true,
        category: 'AI_TIMEOUT',
        previousItineraryPreserved: true,
      })
    )

    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.code).toBe('AI_TIMEOUT')
    expect(body.error).toBe('Itinerary generation timed out. Please try again in a moment.')
  })

  it('distinguishes active generation locks from provider failures', async () => {
    routeMocks.generate.mockRejectedValue(
      new ItineraryGenerationError(
        'GENERATION_IN_PROGRESS',
        'Itinerary generation is already running for this trip. Please retry shortly.',
        409,
        {
          recoverable: true,
          category: 'AI_TEMPORARY_FAILURE',
          previousItineraryPreserved: true,
        }
      )
    )

    const response = await POST(new Request('http://localhost/api/trips/trip-1/generate'), {
      params: Promise.resolve({ tripId: 'trip-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('GENERATION_IN_PROGRESS')
    expect(body.details).toMatchObject({ recoverable: true })
  })
})
