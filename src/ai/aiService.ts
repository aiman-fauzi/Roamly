import { GeminiProvider } from '@/ai/providers/GeminiProvider'
import { GeminiProviderError } from '@/ai/providers/GeminiProvider'
import type { AIProvider, GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'
import { RequestTiming } from '@/lib/observability/requestTiming'

type ProviderFactory = () => AIProvider

class GroqProviderPlaceholder implements AIProvider {
  async generateItinerary(): Promise<GenerateItineraryResponse> {
    throw new GeminiProviderError(
      'Groq itinerary fallback is configured but no Groq provider adapter is installed.',
      'AI_UNKNOWN_FAILURE'
    )
  }
}

class FallbackItineraryAIProvider implements AIProvider {
  constructor(
    private readonly primary: AIProvider,
    private readonly fallback: AIProvider
  ) {}

  async generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse> {
    try {
      return await this.primary.generateItinerary(request)
    } catch (error) {
      if (!isFallbackEligible(error)) throw error
      const providerError = error as GeminiProviderError
      new RequestTiming('itinerary_provider_fallback', request.observabilityRequestId).finish({
        status: 'fallback',
        statusCode: 200,
        errorCode: providerError.code,
      })
      return this.fallback.generateItinerary(request)
    }
  }
}

/**
 * Provider registry maps AI_PROVIDER env var values to factory functions.
 * No caller needs to know which provider is active.
 */
const PROVIDER_MAP: Record<string, ProviderFactory> = {
  gemini: () => new GeminiProvider(),
  groq: () => new GroqProviderPlaceholder(),
}

function isFallbackEligible(error: unknown): boolean {
  return (
    error instanceof GeminiProviderError &&
    (error.code === 'AI_TIMEOUT' ||
      error.code === 'AI_RATE_LIMITED' ||
      error.code === 'AI_QUOTA_EXCEEDED' ||
      error.code === 'AI_TEMPORARY_FAILURE' ||
      error.code === 'AI_NETWORK_FAILURE' ||
      error.code === 'AI_MODEL_UNAVAILABLE')
  )
}

/**
 * Resolves the active AIProvider from the AI_PROVIDER environment variable.
 * Defaults to Gemini for unset or unrecognised values.
 */
export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env,
  providerMap: Record<string, ProviderFactory> = PROVIDER_MAP
): AIProvider {
  const key = env.AI_PROVIDER ?? 'gemini'
  const primaryFactory = providerMap[key] ?? providerMap.gemini
  const primary = primaryFactory()
  const fallbackKey = env.AI_FALLBACK_PROVIDER
  if (!fallbackKey || fallbackKey === 'disabled' || fallbackKey === key) return primary

  const fallbackFactory = providerMap[fallbackKey]
  return fallbackFactory ? new FallbackItineraryAIProvider(primary, fallbackFactory()) : primary
}

/**
 * Public entry point for AI itinerary generation.
 * Called by the /api/trips/[tripId]/generate route handler.
 */
export async function generateItinerary(
  request: GenerateItineraryRequest
): Promise<GenerateItineraryResponse> {
  const provider = resolveProvider()
  return provider.generateItinerary(request)
}
