import { describe, expect, it, vi } from 'vitest'

import { resolveProvider } from '@/ai/aiService'
import { GeminiProviderError } from '@/ai/providers/GeminiProvider'
import type { AIProvider, GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'

const request = {} as GenerateItineraryRequest
const itinerary = {} as GenerateItineraryResponse

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    generateItinerary: vi.fn().mockResolvedValue(itinerary),
    ...overrides,
  }
}

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

describe('aiService provider resolution', () => {
  it('uses the primary provider when fallback is disabled', async () => {
    const primary = provider()
    const fallback = provider()
    const resolved = resolveProvider(
      env({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'disabled' }),
      {
        gemini: () => primary,
        groq: () => fallback,
      }
    )

    await expect(resolved.generateItinerary(request)).resolves.toBe(itinerary)

    expect(primary.generateItinerary).toHaveBeenCalledTimes(1)
    expect(fallback.generateItinerary).not.toHaveBeenCalled()
  })

  it('falls back only for transient primary failures when configured', async () => {
    const primary = provider({
      generateItinerary: vi.fn().mockRejectedValue(new GeminiProviderError('Timed out.', 'AI_TIMEOUT')),
    })
    const fallback = provider()
    const resolved = resolveProvider(
      env({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'groq' }),
      {
        gemini: () => primary,
        groq: () => fallback,
      }
    )

    await expect(resolved.generateItinerary(request)).resolves.toBe(itinerary)

    expect(primary.generateItinerary).toHaveBeenCalledTimes(1)
    expect(fallback.generateItinerary).toHaveBeenCalledTimes(1)
  })

  it('does not fall back for invalid-response contract failures', async () => {
    const error = new GeminiProviderError('Invalid response.', 'AI_INVALID_RESPONSE')
    const primary = provider({
      generateItinerary: vi.fn().mockRejectedValue(error),
    })
    const fallback = provider()
    const resolved = resolveProvider(
      env({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'groq' }),
      {
        gemini: () => primary,
        groq: () => fallback,
      }
    )

    await expect(resolved.generateItinerary(request)).rejects.toBe(error)

    expect(fallback.generateItinerary).not.toHaveBeenCalled()
  })
})
