import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai'
import { z } from 'zod'

import { buildDestinationEnrichmentPrompt } from '@/enrichment/destinationEnrichmentPrompt'
import type {
  DestinationEnrichmentData,
  DestinationEnrichmentProvider,
  EnrichableDestination,
  GeneratedDestinationEnrichment,
} from '@/enrichment/types'

const PROVIDER = 'gemini'
const REQUEST_TIMEOUT_MS = 30_000

const enrichmentSchema = z.object({
  shortSummary: z.string().min(1).max(600),
  bestFor: z.array(z.string().min(1)).min(1).max(12),
  hiddenGemScore: z.number().int().min(0).max(100),
  photographyScore: z.number().int().min(0).max(100),
  familyFriendly: z.boolean(),
  coupleFriendly: z.boolean(),
  kidsFriendly: z.boolean(),
  budgetLevel: z.enum(['FREE', 'BUDGET', 'MODERATE', 'PREMIUM', 'LUXURY']),
  estimatedVisitDurationMinutes: z.number().int().positive(),
  bestVisitingHours: z.array(z.string().min(1)).min(1).max(8),
  indoorOutdoor: z.enum(['INDOOR', 'OUTDOOR', 'MIXED']),
  rainFriendly: z.boolean(),
  searchTags: z.array(z.string().min(1)).min(1).max(24),
})

interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<Pick<GenerateContentResponse, 'text'>>
  }
}

interface GeminiDestinationEnrichmentProviderOptions {
  apiKey?: string
  model?: string
  client?: GeminiClient
}

export class DestinationEnrichmentProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DestinationEnrichmentProviderError'
  }
}

function parseJson(rawText: string): DestinationEnrichmentData {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new DestinationEnrichmentProviderError('Destination enrichment returned malformed JSON.')
  }

  const result = enrichmentSchema.safeParse(parsed)
  if (!result.success) {
    throw new DestinationEnrichmentProviderError('Destination enrichment JSON is missing required fields.')
  }

  return {
    ...result.data,
    bestFor: result.data.bestFor.map((value) => value.trim()).filter(Boolean),
    searchTags: [...new Set(result.data.searchTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
  }
}

export class GeminiDestinationEnrichmentProvider implements DestinationEnrichmentProvider {
  private readonly client: GeminiClient
  private readonly model: string

  constructor(options: GeminiDestinationEnrichmentProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey && !options.client) {
      throw new DestinationEnrichmentProviderError('Gemini API key is missing.')
    }

    const model = options.model ?? process.env.GEMINI_MODEL
    if (!model) {
      throw new DestinationEnrichmentProviderError('Gemini model is missing.')
    }

    this.model = model
    this.client = options.client ?? new GoogleGenAI({ apiKey: apiKey! })
  }

  async generate(destination: EnrichableDestination): Promise<GeneratedDestinationEnrichment> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        buildDestinationEnrichmentPrompt(destination),
        '',
        'Return ONLY valid JSON. Do not include markdown, explanations, or code fences.',
      ].join('\n'),
      config: {
        temperature: 0.35,
        responseMimeType: 'application/json',
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    })

    const text = response.text?.trim()
    if (!text) throw new DestinationEnrichmentProviderError('Destination enrichment returned no text.')

    return {
      ...parseJson(text),
      provider: PROVIDER,
      model: this.model,
    }
  }
}
