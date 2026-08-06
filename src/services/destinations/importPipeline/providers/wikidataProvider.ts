import { DestinationImportHttpClient } from '@/services/destinations/importPipeline/httpClient'
import type { DestinationCandidateEnrichment, NormalizedDestinationCandidate } from '@/services/destinations/importPipeline/types'
import { normalizeAliasList } from '@/services/destinations/importPipeline/utils'
import { assertDestinationSourceUsable } from '@/services/destinations/sources/sourceRegistry'

interface WikidataEntityPayload {
  entities?: Record<
    string,
    {
      aliases?: Record<string, Array<{ value?: string }>>
      claims?: Record<string, unknown[]>
      labels?: Record<string, { value?: string }>
      sitelinks?: Record<string, { url?: string; title?: string }>
    }
  >
}

export interface WikidataEntityMetadata {
  wikidataId: string
  aliases: string[]
  wikipediaUrl: string | null
  commonsCategory: string | null
  imageFileName: string | null
  officialWebsite: string | null
  englishLabel: string | null
  englishWikipediaTitle: string | null
  coordinate?: { latitude: number; longitude: number }
}

function wikidataEntityUrl(wikidataId: string): string {
  const baseUrl = assertDestinationSourceUsable('wikidata').baseUrl
  return `${baseUrl}/${encodeURIComponent(wikidataId)}.json`
}

function readStringClaim(claim: unknown): string | null {
  if (!claim || typeof claim !== 'object') return null
  const maybeClaim = claim as {
    mainsnak?: {
      datavalue?: {
        value?: unknown
      }
    }
  }
  const value = maybeClaim.mainsnak?.datavalue?.value
  return typeof value === 'string' ? value : null
}

function readCoordinateClaim(claim: unknown): { latitude: number; longitude: number } | undefined {
  if (!claim || typeof claim !== 'object') return undefined
  const maybeClaim = claim as {
    mainsnak?: {
      datavalue?: {
        value?: unknown
      }
    }
  }
  const value = maybeClaim.mainsnak?.datavalue?.value
  if (!value || typeof value !== 'object') return undefined
  const coordinate = value as { latitude?: unknown; longitude?: unknown }
  return typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number'
    ? { latitude: coordinate.latitude, longitude: coordinate.longitude }
    : undefined
}

function firstStringClaim(claims: Record<string, unknown[]> | undefined, property: string): string | null {
  return claims?.[property]?.map(readStringClaim).find((value): value is string => Boolean(value)) ?? null
}

function firstCoordinateClaim(claims: Record<string, unknown[]> | undefined, property: string) {
  return claims?.[property]?.map(readCoordinateClaim).find((value): value is { latitude: number; longitude: number } => Boolean(value))
}

function parseWikidataEntity(payload: string, wikidataId: string): WikidataEntityMetadata | null {
  const parsed = JSON.parse(payload) as WikidataEntityPayload
  const entity = parsed.entities?.[wikidataId]
  if (!entity) return null

  const aliases = normalizeAliasList(
    Object.values(entity.aliases ?? {})
      .flat()
      .map((alias) => alias.value)
  )
  const commonsCategory = firstStringClaim(entity.claims, 'P373')
  const imageFileName = firstStringClaim(entity.claims, 'P18')
  const officialWebsite = firstStringClaim(entity.claims, 'P856')
  const coordinate = firstCoordinateClaim(entity.claims, 'P625')
  const wikipediaUrl = entity.sitelinks?.enwiki?.url ?? null
  const englishLabel = entity.labels?.en?.value ?? null
  const englishWikipediaTitle = entity.sitelinks?.enwiki?.title ?? null

  return {
    wikidataId,
    aliases,
    wikipediaUrl,
    commonsCategory,
    imageFileName,
    officialWebsite,
    englishLabel,
    englishWikipediaTitle,
    coordinate,
  }
}

export class WikidataProvider {
  constructor(private readonly httpClient = new DestinationImportHttpClient()) {}

  async fetchEntityMetadata(wikidataId: string): Promise<WikidataEntityMetadata | null> {
    const response = await this.httpClient.get('wikidata', wikidataEntityUrl(wikidataId), { cacheTtlMs: 24 * 60 * 60 * 1000 })
    return parseWikidataEntity(response.text, wikidataId)
  }

  async enrich(candidate: NormalizedDestinationCandidate): Promise<DestinationCandidateEnrichment> {
    if (!candidate.wikidataId) {
      return { validationReasons: [] }
    }
    const metadata = await this.fetchEntityMetadata(candidate.wikidataId)
    if (!metadata) {
      return { wikidataId: candidate.wikidataId, validationReasons: ['MALFORMED_PROVIDER_RESPONSE'] }
    }

    return {
      wikidataId: metadata.wikidataId,
      wikipediaUrl: metadata.wikipediaUrl ?? candidate.wikipediaUrl,
      commonsCategory: metadata.commonsCategory ?? candidate.commonsCategory,
      officialWebsite: metadata.officialWebsite ?? candidate.websiteUrl,
      aliases: metadata.aliases,
      validationReasons: [],
    }
  }
}
