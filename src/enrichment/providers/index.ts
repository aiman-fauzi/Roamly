import { GeminiDestinationEnrichmentProvider } from '@/enrichment/providers/GeminiDestinationEnrichmentProvider'
import type { DestinationEnrichmentProvider } from '@/enrichment/types'

export function resolveDestinationEnrichmentProvider(): DestinationEnrichmentProvider {
  return new GeminiDestinationEnrichmentProvider()
}
