import {
  parseStructuredOpeningHours,
  parseStructuredPrice,
} from '@/services/destinations/facts/parsers'
import { checkRobotsAllowed, type RobotsDecision } from '@/services/destinations/facts/robots'
import { assertSourcePolicyAllowsUrl } from '@/services/destinations/facts/sourcePolicy'
import type {
  DestinationFactFetchInput,
  DestinationFactFetchResult,
  DestinationFactProvenance,
  DestinationFactSourceAdapter,
  OperationalStatus,
  StructuredPrice,
} from '@/services/destinations/facts/types'

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const PARSER_VERSION = 'official-jsonld-v1'
const USER_AGENT = 'RoamlyBot/0.1 (+https://roamly.local)'

interface AdapterOptions {
  fetcher?: Fetcher
}

interface JsonLdPlace {
  '@type'?: string | string[]
  name?: string
  url?: string
  address?: string | { streetAddress?: string; addressLocality?: string; addressCountry?: string }
  openingHours?: string | string[]
  offers?: { price?: string | number; priceCurrency?: string } | Array<{ price?: string | number; priceCurrency?: string }>
}

interface JsonLdOffer {
  price?: string | number
  priceCurrency?: string
}

interface ParsedOffer {
  offer: JsonLdOffer
  price: StructuredPrice
}

function sourceProvenance(input: {
  sourceUrl: string
  sourceRecordId?: string
  rawValue: unknown
  normalizedValue: unknown
  retrievedAt: string
}): DestinationFactProvenance {
  return {
    sourceName: 'Fixture official attraction page',
    sourceUrl: input.sourceUrl,
    sourceRecordId: input.sourceRecordId,
    retrievedAt: input.retrievedAt,
    verifiedAt: input.retrievedAt,
    rawValue: input.rawValue,
    normalizedValue: input.normalizedValue,
    parserVersion: PARSER_VERSION,
    sourceTier: 'OFFICIAL_SOURCE',
  }
}

function readJsonLd(html: string): JsonLdPlace | null {
  const match = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim()) as JsonLdPlace | JsonLdPlace[]
    return Array.isArray(parsed) ? parsed[0] ?? null : parsed
  } catch {
    return null
  }
}

function readAddress(value: JsonLdPlace['address']): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return [value.streetAddress, value.addressLocality, value.addressCountry].filter(Boolean).join(', ')
}

function readOpeningHours(value: JsonLdPlace['openingHours']): string | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value.join('; ') : value
}

function readOffers(value: JsonLdPlace['offers']): JsonLdOffer[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function readOperationalStatus(html: string): OperationalStatus {
  const lower = html.toLowerCase()
  if (lower.includes('permanently closed')) return 'PERMANENTLY_CLOSED'
  if (lower.includes('temporarily closed')) return 'TEMPORARILY_CLOSED'
  if (lower.includes('open daily') || lower.includes('openinghours')) return 'OPEN'
  return 'UNKNOWN'
}

async function guardedFetch(
  sourceKey: string,
  url: string,
  options: AdapterOptions
): Promise<{ html: string; robots: RobotsDecision; retrievedAt: string }> {
  assertSourcePolicyAllowsUrl(sourceKey, url)
  const fetcher = options.fetcher ?? fetch
  const robots = await checkRobotsAllowed(url, { fetcher, userAgent: USER_AGENT })
  if (!robots.allowed) {
    throw new Error(`Robots policy denied ${url}: ${robots.reason}`)
  }

  const response = await fetcher(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html, application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Fact source fetch failed with HTTP ${response.status}.`)

  return {
    html: await response.text(),
    robots,
    retrievedAt: new Date().toISOString(),
  }
}

export class FixtureOfficialAttractionAdapter implements DestinationFactSourceAdapter {
  readonly sourceKey = 'fixture-official-attraction'
  private readonly options: AdapterOptions

  constructor(options: AdapterOptions = {}) {
    this.options = options
  }

  supports(url: string): boolean {
    try {
      const parsed = new URL(url)
      return parsed.hostname === 'official.roamly.local' && parsed.pathname.startsWith('/kuala-lumpur/')
    } catch {
      return false
    }
  }

  async fetch(input: DestinationFactFetchInput): Promise<DestinationFactFetchResult> {
    if (!this.supports(input.url)) {
      throw new Error(`Unsupported fixture official attraction URL: ${input.url}`)
    }

    const { html, retrievedAt } = await guardedFetch(this.sourceKey, input.url, this.options)
    const jsonLd = readJsonLd(html)
    if (!jsonLd) throw new Error('No supported JSON-LD place data found.')

    const provenance: DestinationFactProvenance[] = []
    const result: DestinationFactFetchResult = {
      sourceKey: this.sourceKey,
      officialUrl: jsonLd.url ?? input.url,
      retrievedAt,
      provenance,
    }

    const address = readAddress(jsonLd.address)
    if (address) {
      const itemProvenance = sourceProvenance({
        sourceUrl: input.url,
        sourceRecordId: input.sourceRecordId,
        rawValue: jsonLd.address,
        normalizedValue: address,
        retrievedAt,
      })
      result.address = { value: address, provenance: itemProvenance }
      provenance.push(itemProvenance)
    }

    const openingHoursRaw = readOpeningHours(jsonLd.openingHours)
    const openingHours = openingHoursRaw
      ? parseStructuredOpeningHours(openingHoursRaw, {
          timezone: 'Asia/Kuala_Lumpur',
          sourceUrl: input.url,
          verifiedAt: retrievedAt,
        })
      : null
    if (openingHours) {
      openingHours.provenance = sourceProvenance({
        sourceUrl: input.url,
        sourceRecordId: input.sourceRecordId,
        rawValue: openingHoursRaw,
        normalizedValue: openingHours.weekly,
        retrievedAt,
      })
      result.openingHours = openingHours
      provenance.push(openingHours.provenance)
    }

    const ticketPrices = readOffers(jsonLd.offers)
      .map((offer) => ({
        offer,
        price: parseStructuredPrice(String(offer.price ?? 'unknown'), {
          currency: offer.priceCurrency ?? 'MYR',
          sourceUrl: input.url,
          verifiedAt: retrievedAt,
        }),
      }))
      .filter((entry): entry is ParsedOffer => Boolean(entry.price))
      .map(({ offer, price }) => {
        return {
          ...price,
          provenance: sourceProvenance({
            sourceUrl: input.url,
            sourceRecordId: input.sourceRecordId,
            rawValue: offer,
            normalizedValue: price,
            retrievedAt,
          }),
        }
      })
    if (ticketPrices.length > 0) {
      result.ticketPrices = ticketPrices
      provenance.push(...ticketPrices.map((price) => price.provenance).filter(Boolean))
    }

    const operationalStatus = readOperationalStatus(html)
    const operationalProvenance = sourceProvenance({
      sourceUrl: input.url,
      sourceRecordId: input.sourceRecordId,
      rawValue: operationalStatus,
      normalizedValue: operationalStatus,
      retrievedAt,
    })
    result.operationalStatus = { value: operationalStatus, provenance: operationalProvenance }
    provenance.push(operationalProvenance)

    return result
  }
}

export function createFactSourceAdapters(options: AdapterOptions = {}): DestinationFactSourceAdapter[] {
  return [new FixtureOfficialAttractionAdapter(options)]
}
