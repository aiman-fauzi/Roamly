import {
  DestinationFactEntityType,
  DestinationFactSourceTier,
  DestinationFactStatus,
  DestinationFactType,
  type DestinationFact,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FixtureOfficialAttractionAdapter } from '@/services/destinations/facts/adapters'
import {
  buildDestinationFactFingerprint,
  selectEffectiveDestinationFact,
} from '@/services/destinations/facts/destinationFactService'
import { mergeFactsByPrecedence, type MergeableFact } from '@/services/destinations/facts/merge'
import {
  parseOpeningHoursFact,
  parseStructuredOpeningHours,
  parseStructuredPrice,
  parseStructuredPrices,
} from '@/services/destinations/facts/parsers'
import {
  checkRobotsAllowed,
  clearRobotsCache,
  parseRobotsTxt,
} from '@/services/destinations/facts/robots'
import { assertSourcePolicyAllowsUrl, listSourcePolicies } from '@/services/destinations/facts/sourcePolicy'
import { evaluateFactStaleness } from '@/services/destinations/facts/staleness'
import type {
  DestinationFactProvenance,
  FactSourceTier,
} from '@/services/destinations/facts/types'

function response(body: string, status = 200): Response {
  return new Response(body, { status })
}

function provenance(sourceTier: FactSourceTier, verifiedAt: string): DestinationFactProvenance {
  return {
    sourceName: sourceTier.toLowerCase(),
    sourceUrl: 'https://example.test/source',
    sourceRecordId: `${sourceTier}:${verifiedAt}`,
    retrievedAt: verifiedAt,
    verifiedAt,
    rawValue: 'raw',
    normalizedValue: 'normalized',
    parserVersion: 'test-v1',
    sourceTier,
  }
}

function durableFact(overrides: Partial<DestinationFact>): DestinationFact {
  return {
    id: 'fact-1',
    entityType: 'ATTRACTION',
    entityId: 'entity-1',
    factType: DestinationFactType.TICKET_PRICE,
    normalizedValue: { amount: 10, currency: 'MYR', priceType: 'FIXED' },
    rawValue: 'RM 10',
    currency: 'MYR',
    sourceKey: 'test-source',
    sourceUrl: 'https://example.test/source',
    sourceRecordId: 'record-1',
    sourceTier: DestinationFactSourceTier.OPENSTREETMAP_STRUCTURED,
    confidence: 80,
    retrievedAt: new Date('2026-08-01T00:00:00.000Z'),
    verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: null,
    parserVersion: 'test-v1',
    status: DestinationFactStatus.ACTIVE,
    fingerprint: 'fingerprint-1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('destination fact parsers', () => {
  it('parses weekly opening-hour ranges and closed days', () => {
    const parsed = parseStructuredOpeningHours('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off', {
      timezone: 'Asia/Kuala_Lumpur',
      sourceUrl: 'https://example.test/hours',
      verifiedAt: '2026-08-04T00:00:00.000Z',
    })

    expect(parsed?.timezone).toBe('Asia/Kuala_Lumpur')
    expect(parsed?.weekly).toHaveLength(7)
    expect(parsed?.weekly[0]).toMatchObject({
      day: 'MONDAY',
      intervals: [{ opens: '09:00', closes: '18:00' }],
    })
    expect(parsed?.weekly[6]).toMatchObject({ day: 'SUNDAY', closed: true })
  })

  it('parses 24/7 and multiple daily intervals without losing notes', () => {
    expect(parseOpeningHoursFact('24/7').value?.weekly).toHaveLength(7)

    const parsed = parseOpeningHoursFact('Mo-Fr 09:00-12:00,13:00-17:00; PH closed')
    expect(parsed.status).toBe('PARTIAL')
    expect(parsed.value?.weekly[0].intervals).toEqual([
      { opens: '09:00', closes: '12:00' },
      { opens: '13:00', closes: '17:00' },
    ])
    expect(parsed.value?.notes).toBe('PH closed')
  })

  it('does not turn ambiguous opening-hours text into a false schedule', () => {
    expect(parseOpeningHoursFact('Hours vary seasonally and on public holidays')).toMatchObject({
      status: 'AMBIGUOUS',
    })
  })

  it('parses free, fixed, from, range, and unknown prices', () => {
    expect(parseStructuredPrice('Free')).toMatchObject({ amount: 0, priceType: 'FREE' })
    expect(parseStructuredPrice('RM 20')).toMatchObject({ amount: 20, priceType: 'FIXED' })
    expect(parseStructuredPrice('from RM 12')).toMatchObject({ minAmount: 12, priceType: 'FROM' })
    expect(parseStructuredPrice('RM 5 - RM 15')).toMatchObject({
      minAmount: 5,
      maxAmount: 15,
      priceType: 'RANGE',
    })
    expect(parseStructuredPrice('unknown')).toMatchObject({ priceType: 'UNKNOWN', currency: 'MYR' })
  })

  it('parses audience-specific prices without averaging them', () => {
    const parsed = parseStructuredPrices('Adult RM 20; Child RM 10; Senior RM 12')

    expect(parsed.status).toBe('PARSED')
    expect(parsed.values).toEqual([
      expect.objectContaining({ amount: 20, audience: 'ADULT' }),
      expect.objectContaining({ amount: 10, audience: 'CHILD' }),
      expect.objectContaining({ amount: 12, audience: 'SENIOR' }),
    ])
  })
})

describe('destination source policy', () => {
  it('documents approved and disallowed source policies', () => {
    expect(listSourcePolicies().map((policy) => policy.sourceKey)).toEqual(
      expect.arrayContaining([
        'openstreetmap',
        'wikivoyage',
        'wikipedia',
        'government-tourism',
        'fixture-official-attraction',
        'trusted-manual-travel-listing',
        'trusted-manual-official-site',
        'commercial-booking-platforms',
      ])
    )
  })

  it('allows only allowlisted fixture official attraction URLs', () => {
    expect(() =>
      assertSourcePolicyAllowsUrl(
        'fixture-official-attraction',
        'https://official.roamly.local/kuala-lumpur/museum'
      )
    ).not.toThrow()
    expect(() =>
      assertSourcePolicyAllowsUrl('fixture-official-attraction', 'https://official.roamly.local/other/museum')
    ).toThrow(/not allowlisted/)
    expect(() =>
      assertSourcePolicyAllowsUrl('fixture-official-attraction', 'https://not-official.test/kuala-lumpur/museum')
    ).toThrow(/not allowlisted/)
  })

  it('rejects sources marked not allowed', () => {
    expect(() =>
      assertSourcePolicyAllowsUrl('commercial-booking-platforms', 'https://booking.example/listing')
    ).toThrow(/not approved/)
  })

  it('allows manual-only policies only when the caller explicitly opts in', () => {
    const url = 'https://malaysialife.org/national-mosque-in-kuala-lumpur/'
    expect(() => assertSourcePolicyAllowsUrl('trusted-manual-travel-listing', url)).toThrow(/not approved/)
    expect(() =>
      assertSourcePolicyAllowsUrl('trusted-manual-travel-listing', url, { allowManualImport: true })
    ).not.toThrow()
  })

  it('allows manual official-site facts only through explicit manual import', () => {
    const url = 'https://www.muziumnegara.gov.my/en/ticket'
    expect(() => assertSourcePolicyAllowsUrl('trusted-manual-official-site', url)).toThrow(/not approved/)
    expect(() =>
      assertSourcePolicyAllowsUrl('trusted-manual-official-site', url, { allowManualImport: true })
    ).not.toThrow()
  })
})

describe('robots.txt enforcement', () => {
  beforeEach(() => {
    clearRobotsCache()
  })

  it('parses user-agent groups with allow and disallow rules', () => {
    const rules = parseRobotsTxt(`
      User-agent: RoamlyBot
      Disallow: /private
      Allow: /private/public

      User-agent: *
      Disallow: /blocked
    `)

    expect(rules).toEqual([
      { userAgents: ['roamlybot'], allows: ['/private/public'], disallows: ['/private'] },
      { userAgents: ['*'], allows: [], disallows: ['/blocked'] },
    ])
  })

  it('allows the longest matching Allow rule', async () => {
    const fetcher = vi.fn(async () =>
      response(`
        User-agent: *
        Disallow: /kuala-lumpur/
        Allow: /kuala-lumpur/public/
      `)
    )

    const decision = await checkRobotsAllowed('https://official.roamly.local/kuala-lumpur/public/museum', {
      fetcher,
      userAgent: 'RoamlyBot/0.1',
    })

    expect(decision).toMatchObject({
      allowed: true,
      matchedRule: 'Allow: /kuala-lumpur/public/',
    })
  })

  it('disallows matching blocked paths', async () => {
    const fetcher = vi.fn(async () =>
      response(`
        User-agent: *
        Disallow: /kuala-lumpur/private
      `)
    )

    const decision = await checkRobotsAllowed('https://official.roamly.local/kuala-lumpur/private/museum', {
      fetcher,
      userAgent: 'RoamlyBot/0.1',
    })

    expect(decision).toMatchObject({
      allowed: false,
      matchedRule: 'Disallow: /kuala-lumpur/private',
    })
  })

  it('refuses conservatively when robots.txt cannot be fetched', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network failed')
    })

    const decision = await checkRobotsAllowed('https://official.roamly.local/kuala-lumpur/museum', {
      fetcher,
      userAgent: 'RoamlyBot/0.1',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('refusing conservatively')
  })
})

describe('fixture official attraction adapter', () => {
  beforeEach(() => {
    clearRobotsCache()
  })

  it('extracts normalized facts and provenance from approved fixture JSON-LD', async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "TouristAttraction",
              "url": "https://official.roamly.local/kuala-lumpur/museum",
              "address": {
                "streetAddress": "1 Museum Road",
                "addressLocality": "Kuala Lumpur",
                "addressCountry": "MY"
              },
              "openingHours": "Mo-Fr 09:00-18:00; Sa-Su 10:00-16:00",
              "offers": { "price": "10", "priceCurrency": "MYR" }
            }
          </script>
        </head>
        <body>Open daily</body>
      </html>
    `
    const fetcher = vi.fn(async (input: string) =>
      input.endsWith('/robots.txt') ? response('User-agent: *\nAllow: /') : response(html)
    )
    const adapter = new FixtureOfficialAttractionAdapter({ fetcher })

    const result = await adapter.fetch({
      url: 'https://official.roamly.local/kuala-lumpur/museum',
      sourceRecordId: 'official:museum',
    })

    expect(result.address?.value).toBe('1 Museum Road, Kuala Lumpur, MY')
    expect(result.openingHours?.weekly).toHaveLength(7)
    expect(result.ticketPrices?.[0]).toMatchObject({
      amount: 10,
      currency: 'MYR',
      priceType: 'FIXED',
    })
    expect(result.operationalStatus?.value).toBe('OPEN')
    expect(result.provenance.every((item) => item.sourceTier === 'OFFICIAL_SOURCE')).toBe(true)
    expect(result.ticketPrices?.[0].provenance?.sourceRecordId).toBe('official:museum')
  })

  it('rejects unsupported domains before fetching', async () => {
    const fetcher = vi.fn()
    const adapter = new FixtureOfficialAttractionAdapter({ fetcher })

    await expect(adapter.fetch({ url: 'https://example.test/kuala-lumpur/museum' })).rejects.toThrow(
      /Unsupported fixture/
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects paths disallowed by robots.txt without fetching the page', async () => {
    const fetcher = vi.fn(async () => response('User-agent: *\nDisallow: /kuala-lumpur/private'))
    const adapter = new FixtureOfficialAttractionAdapter({ fetcher })

    await expect(
      adapter.fetch({ url: 'https://official.roamly.local/kuala-lumpur/private/museum' })
    ).rejects.toThrow(/Robots policy denied/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('destination fact merge precedence', () => {
  it('keeps higher-confidence factual sources over newer lower-confidence facts', () => {
    const official: MergeableFact<string> = {
      value: 'RM 10',
      provenance: provenance('OFFICIAL_SOURCE', '2026-06-01T00:00:00.000Z'),
    }
    const osm: MergeableFact<string> = {
      value: 'RM 8',
      provenance: provenance('OPENSTREETMAP_STRUCTURED', '2026-08-01T00:00:00.000Z'),
    }

    const result = mergeFactsByPrecedence([osm, official])

    expect(result?.accepted).toBe(official)
    expect(result?.conflicts[0]).toMatchObject({ rejected: osm, reason: 'Lower-confidence source tier.' })
  })

  it('keeps the newest fact within the same source tier', () => {
    const older: MergeableFact<string> = {
      value: '09:00-17:00',
      provenance: provenance('GOVERNMENT_OPEN_DATA', '2026-07-01T00:00:00.000Z'),
    }
    const newer: MergeableFact<string> = {
      value: '10:00-18:00',
      provenance: provenance('GOVERNMENT_OPEN_DATA', '2026-08-01T00:00:00.000Z'),
    }

    const result = mergeFactsByPrecedence([older, newer])

    expect(result?.accepted).toBe(newer)
    expect(result?.conflicts[0]).toMatchObject({
      rejected: older,
      reason: 'Older verified timestamp at the same source tier.',
    })
  })

  it('does not allow Gemini-derived facts to overwrite sourced prices', () => {
    const sourceFact: MergeableFact<string> = {
      value: 'RM 10',
      provenance: provenance('OPENSTREETMAP_STRUCTURED', '2026-08-01T00:00:00.000Z'),
    }
    const geminiFact: MergeableFact<string> = {
      value: 'RM 20',
      provenance: provenance('GEMINI_DERIVED', '2026-08-04T00:00:00.000Z'),
    }

    expect(mergeFactsByPrecedence([geminiFact, sourceFact])?.accepted).toBe(sourceFact)
  })
})

describe('durable effective fact selection', () => {
  it('builds stable fingerprints for idempotent exact re-imports', () => {
    const input = {
      entityType: DestinationFactEntityType.ATTRACTION,
      entityId: 'entity-1',
      factType: DestinationFactType.TICKET_PRICE,
      normalizedValue: { priceType: 'FIXED', currency: 'MYR', amount: 10 },
      sourceKey: 'trusted-manual-official-site',
      sourceUrl: 'https://example.test/ticket',
      sourceRecordId: 'ticket-1',
      sourceTier: DestinationFactSourceTier.OFFICIAL_SOURCE,
      retrievedAt: new Date('2026-08-04T00:00:00.000Z'),
      parserVersion: 'manual-test-v1',
    } as const

    expect(buildDestinationFactFingerprint(input)).toBe(
      buildDestinationFactFingerprint({
        ...input,
        normalizedValue: { amount: 10, currency: 'MYR', priceType: 'FIXED' },
      })
    )
    expect(buildDestinationFactFingerprint(input)).not.toBe(
      buildDestinationFactFingerprint({
        ...input,
        normalizedValue: { amount: 12, currency: 'MYR', priceType: 'FIXED' },
      })
    )
  })

  it('selects higher-tier facts while preserving conflicts', () => {
    const official = durableFact({
      id: 'official',
      sourceTier: DestinationFactSourceTier.OFFICIAL_SOURCE,
      verifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const osm = durableFact({
      id: 'osm',
      sourceTier: DestinationFactSourceTier.OPENSTREETMAP_STRUCTURED,
      verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    })

    const selected = selectEffectiveDestinationFact([osm, official], new Date('2026-08-04T00:00:00.000Z'))

    expect(selected?.fact.id).toBe('official')
    expect(selected?.status).toBe('VERIFIED')
    expect(selected?.conflicts.map((fact) => fact.id)).toEqual(['osm'])
  })

  it('keeps stale official facts ahead of lower-tier facts but marks them stale', () => {
    const staleOfficial = durableFact({
      id: 'stale-official',
      sourceTier: DestinationFactSourceTier.OFFICIAL_SOURCE,
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const freshOsm = durableFact({
      id: 'fresh-osm',
      sourceTier: DestinationFactSourceTier.OPENSTREETMAP_STRUCTURED,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    })

    const selected = selectEffectiveDestinationFact([freshOsm, staleOfficial], new Date('2026-08-04T00:00:00.000Z'))

    expect(selected?.fact.id).toBe('stale-official')
    expect(selected?.status).toBe('STALE')
  })

  it('excludes invalid facts and Gemini-derived prices from effective authority', () => {
    const invalid = durableFact({
      id: 'invalid',
      status: DestinationFactStatus.INVALID,
      sourceTier: DestinationFactSourceTier.OFFICIAL_SOURCE,
    })
    const geminiPrice = durableFact({
      id: 'gemini-price',
      sourceTier: DestinationFactSourceTier.GEMINI_DERIVED,
      factType: DestinationFactType.TICKET_PRICE,
    })

    expect(selectEffectiveDestinationFact([invalid, geminiPrice])).toBeNull()
  })
})

describe('destination fact stale-data rules', () => {
  it('marks ticket prices stale after the configured threshold', () => {
    const decision = evaluateFactStaleness(
      'TICKET_PRICE',
      { retrievedAt: '2026-07-01T00:00:00.000Z' },
      new Date('2026-08-04T00:00:00.000Z')
    )

    expect(decision).toMatchObject({ stale: true, thresholdDays: 30 })
  })

  it('keeps recently verified opening hours usable', () => {
    const decision = evaluateFactStaleness(
      'OPENING_HOURS',
      { retrievedAt: '2026-06-10T00:00:00.000Z' },
      new Date('2026-08-04T00:00:00.000Z')
    )

    expect(decision).toMatchObject({ stale: false, thresholdDays: 60 })
  })

  it('allows custom stale thresholds', () => {
    const decision = evaluateFactStaleness(
      'DESCRIPTION_TAGS',
      { retrievedAt: '2026-08-01T00:00:00.000Z' },
      new Date('2026-08-04T00:00:00.000Z'),
      {
        ticketPricesDays: 1,
        openingHoursDays: 1,
        addressCoordinatesDays: 1,
        descriptionTagsDays: 2,
      }
    )

    expect(decision).toMatchObject({ stale: true, thresholdDays: 2 })
  })
})
