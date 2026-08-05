export type SourceAccessMethod =
  | 'OPEN_DATA'
  | 'API'
  | 'SCRAPER_ALLOWED'
  | 'MANUAL_IMPORT'
  | 'API_ONLY'
  | 'NOT_ALLOWED'
  | 'PENDING_REVIEW'

export interface SourcePolicy {
  sourceKey: string
  baseUrl: string
  accessMethod: SourceAccessMethod
  allowedDomains: string[]
  allowedPaths?: string[]
  disallowedPaths?: string[]
  robotsUrl?: string
  termsUrl?: string
  commercialUseAllowed?: boolean
  requestDelayMs?: number
  lastReviewedAt?: string
  notes?: string
}

const SOURCE_POLICIES: SourcePolicy[] = [
  {
    sourceKey: 'openstreetmap',
    baseUrl: 'https://www.openstreetmap.org',
    accessMethod: 'OPEN_DATA',
    allowedDomains: ['www.openstreetmap.org', 'overpass-api.de'],
    termsUrl: 'https://www.openstreetmap.org/copyright',
    commercialUseAllowed: true,
    requestDelayMs: 1000,
    lastReviewedAt: '2026-08-04',
    notes: 'Use structured OSM tags and attribution. Do not over-query public Overpass endpoints.',
  },
  {
    sourceKey: 'wikivoyage',
    baseUrl: 'https://en.wikivoyage.org',
    accessMethod: 'OPEN_DATA',
    allowedDomains: ['en.wikivoyage.org'],
    robotsUrl: 'https://en.wikivoyage.org/robots.txt',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    commercialUseAllowed: true,
    requestDelayMs: 1000,
    lastReviewedAt: '2026-08-04',
    notes: 'Use MediaWiki API and listing templates; keep attribution and source URLs.',
  },
  {
    sourceKey: 'wikipedia',
    baseUrl: 'https://en.wikipedia.org',
    accessMethod: 'OPEN_DATA',
    allowedDomains: ['en.wikipedia.org'],
    robotsUrl: 'https://en.wikipedia.org/robots.txt',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    commercialUseAllowed: true,
    requestDelayMs: 1000,
    lastReviewedAt: '2026-08-04',
    notes: 'Use MediaWiki API extracts and coordinates only; keep attribution and source URLs.',
  },
  {
    sourceKey: 'government-tourism',
    baseUrl: 'https://data.gov.my',
    accessMethod: 'OPEN_DATA',
    allowedDomains: ['data.gov.my'],
    termsUrl: 'https://developer.data.gov.my/realtime-api/terms',
    requestDelayMs: 1000,
    lastReviewedAt: '2026-08-04',
    notes: 'Use only configured datasets or APIs.',
  },
  {
    sourceKey: 'fixture-official-attraction',
    baseUrl: 'https://official.roamly.local',
    accessMethod: 'SCRAPER_ALLOWED',
    allowedDomains: ['official.roamly.local'],
    allowedPaths: ['/kuala-lumpur/'],
    robotsUrl: 'https://official.roamly.local/robots.txt',
    commercialUseAllowed: false,
    requestDelayMs: 0,
    lastReviewedAt: '2026-08-04',
    notes: 'Deterministic test fixture only; no live official site is scraped by this adapter.',
  },
  {
    sourceKey: 'trusted-manual-travel-listing',
    baseUrl: 'https://malaysialife.org',
    accessMethod: 'MANUAL_IMPORT',
    allowedDomains: ['malaysialife.org', 'www.visitselangor.com', 'www.sunwayhotels.com'],
    requestDelayMs: 0,
    lastReviewedAt: '2026-08-04',
    notes: 'Manual fact entry only. Do not automate fetching or crawling for this source.',
  },
  {
    sourceKey: 'trusted-manual-official-site',
    baseUrl: 'https://www.muziumnegara.gov.my',
    accessMethod: 'MANUAL_IMPORT',
    allowedDomains: [
      'aquariaklcc.com',
      'tickets.aquariaklcc.com',
      'www.muziumnegara.gov.my',
    ],
    requestDelayMs: 0,
    lastReviewedAt: '2026-08-04',
    notes: 'Manual fact entry from official public attraction sites only; no automated crawling.',
  },
  {
    sourceKey: 'commercial-booking-platforms',
    baseUrl: 'https://example.invalid',
    accessMethod: 'NOT_ALLOWED',
    allowedDomains: [],
    notes: 'Booking.com, Agoda, Airbnb, Tripadvisor, Klook, Expedia, and airline booking pages are out of scope.',
  },
]

export function listSourcePolicies(): SourcePolicy[] {
  return [...SOURCE_POLICIES]
}

export function getSourcePolicy(sourceKey: string): SourcePolicy | null {
  return SOURCE_POLICIES.find((policy) => policy.sourceKey === sourceKey) ?? null
}

export function assertSourcePolicyAllowsUrl(
  sourceKey: string,
  url: string,
  options: { allowManualImport?: boolean } = {}
): SourcePolicy {
  const policy = getSourcePolicy(sourceKey)
  if (!policy) throw new Error(`Source policy ${sourceKey} is not registered.`)
  const allowedAccessMethods = new Set<SourceAccessMethod>(['SCRAPER_ALLOWED', 'OPEN_DATA', 'API'])
  if (options.allowManualImport) allowedAccessMethods.add('MANUAL_IMPORT')
  if (!allowedAccessMethods.has(policy.accessMethod)) {
    throw new Error(`Source policy ${sourceKey} is not approved for automated access.`)
  }

  const parsed = new URL(url)
  if (!policy.allowedDomains.includes(parsed.hostname)) {
    throw new Error(`URL host ${parsed.hostname} is not allowlisted for ${sourceKey}.`)
  }
  if (policy.allowedPaths && !policy.allowedPaths.some((path) => parsed.pathname.startsWith(path))) {
    throw new Error(`URL path ${parsed.pathname} is not allowlisted for ${sourceKey}.`)
  }
  if (policy.disallowedPaths?.some((path) => parsed.pathname.startsWith(path))) {
    throw new Error(`URL path ${parsed.pathname} is disallowed for ${sourceKey}.`)
  }

  return policy
}
