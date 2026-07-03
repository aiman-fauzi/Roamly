import { GeminiProvider } from '@/ai/providers/GeminiProvider'
import type { AIProvider, GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'

/**
 * Provider registry maps AI_PROVIDER env var values to factory functions.
 * No caller needs to know which provider is active.
 */
const PROVIDER_MAP: Record<string, () => AIProvider> = {
  gemini: () => new GeminiProvider(),
}

/**
 * Resolves the active AIProvider from the AI_PROVIDER environment variable.
 * Defaults to Gemini for unset or unrecognised values.
 */
export function resolveProvider(): AIProvider {
  const key = process.env.AI_PROVIDER ?? 'gemini'
  const factory = PROVIDER_MAP[key] ?? PROVIDER_MAP.gemini
  return factory()
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