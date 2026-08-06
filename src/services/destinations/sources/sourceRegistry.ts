export type DestinationSourceAccessMethod = 'api' | 'dataset' | 'html'

export interface DestinationSourceDefinition {
  id: string
  name: string
  baseUrl: string
  accessMethod: DestinationSourceAccessMethod
  enabled: boolean
  licenseName: string | null
  licenseUrl: string | null
  termsUrl: string | null
  attributionRequired: boolean
  commercialReuseAllowed: boolean | null
  derivativeUseAllowed: boolean | null
  robotsPolicyCheckedAt: Date | null
  termsCheckedAt: Date | null
  rateLimitPerSecond: number
  notes: string | null
}

export type DestinationSourceRegistryErrorCode =
  | 'SOURCE_NOT_REGISTERED'
  | 'SOURCE_DISABLED'
  | 'SOURCE_LICENSE_MISSING'
  | 'SOURCE_COMMERCIAL_REUSE_DISALLOWED'
  | 'SOURCE_HTML_SCRAPING_DISABLED'

export class DestinationSourceRegistryError extends Error {
  constructor(
    public readonly code: DestinationSourceRegistryErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DestinationSourceRegistryError'
  }
}

const REVIEWED_AT = new Date('2026-08-06T00:00:00.000Z')

const SOURCE_DEFINITIONS: DestinationSourceDefinition[] = [
  {
    id: 'openstreetmap-overpass',
    name: 'OpenStreetMap via Overpass API',
    baseUrl: 'https://overpass-api.de/api/interpreter',
    accessMethod: 'api',
    enabled: true,
    licenseName: 'Open Database License 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    termsUrl: 'https://www.openstreetmap.org/copyright',
    attributionRequired: true,
    commercialReuseAllowed: true,
    derivativeUseAllowed: true,
    robotsPolicyCheckedAt: REVIEWED_AT,
    termsCheckedAt: REVIEWED_AT,
    rateLimitPerSecond: 0.2,
    notes: 'Use bounded Overpass API requests, preserve OSM attribution, and avoid bulk unrestricted querying.',
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    baseUrl: 'https://www.wikidata.org/wiki/Special:EntityData',
    accessMethod: 'api',
    enabled: true,
    licenseName: 'CC0 1.0 Universal Public Domain Dedication',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
    attributionRequired: false,
    commercialReuseAllowed: true,
    derivativeUseAllowed: true,
    robotsPolicyCheckedAt: REVIEWED_AT,
    termsCheckedAt: REVIEWED_AT,
    rateLimitPerSecond: 0.5,
    notes: 'Use only stable entity IDs supplied by trusted upstream records; do not search-match ambiguous attractions automatically.',
  },
  {
    id: 'wikimedia-commons',
    name: 'Wikimedia Commons',
    baseUrl: 'https://commons.wikimedia.org/w/api.php',
    accessMethod: 'api',
    enabled: true,
    licenseName: 'Per-file open licence metadata',
    licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    attributionRequired: true,
    commercialReuseAllowed: null,
    derivativeUseAllowed: null,
    robotsPolicyCheckedAt: REVIEWED_AT,
    termsCheckedAt: REVIEWED_AT,
    rateLimitPerSecond: 0.5,
    notes: 'Accept only files whose API metadata reports a free/reusable licence and complete attribution fields.',
  },
  {
    id: 'wikivoyage',
    name: 'Wikivoyage',
    baseUrl: 'https://en.wikivoyage.org/w/api.php',
    accessMethod: 'api',
    enabled: true,
    licenseName: 'Creative Commons Attribution-ShareAlike 4.0 International',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    attributionRequired: true,
    commercialReuseAllowed: true,
    derivativeUseAllowed: true,
    robotsPolicyCheckedAt: REVIEWED_AT,
    termsCheckedAt: REVIEWED_AT,
    rateLimitPerSecond: 0.5,
    notes: 'Use MediaWiki API only; do not import prose unless attribution and CC BY-SA display requirements are implemented.',
  },
  {
    id: 'government-tourism-open-data',
    name: 'Government or tourism open-data APIs',
    baseUrl: 'https://example.invalid',
    accessMethod: 'dataset',
    enabled: false,
    licenseName: null,
    licenseUrl: null,
    termsUrl: null,
    attributionRequired: true,
    commercialReuseAllowed: null,
    derivativeUseAllowed: null,
    robotsPolicyCheckedAt: null,
    termsCheckedAt: null,
    rateLimitPerSecond: 0.2,
    notes: 'Enable only after a specific dataset/API has been reviewed and registered.',
  },
  {
    id: 'official-tourism-html',
    name: 'Official tourism website HTML',
    baseUrl: 'https://example.invalid',
    accessMethod: 'html',
    enabled: false,
    licenseName: null,
    licenseUrl: null,
    termsUrl: null,
    attributionRequired: true,
    commercialReuseAllowed: null,
    derivativeUseAllowed: null,
    robotsPolicyCheckedAt: null,
    termsCheckedAt: null,
    rateLimitPerSecond: 0,
    notes: 'Disabled by default; an official website is not automatically an open-data source.',
  },
]

export function listDestinationSourceDefinitions(): DestinationSourceDefinition[] {
  return SOURCE_DEFINITIONS.map((source) => ({ ...source }))
}

export function getDestinationSourceDefinition(sourceId: string): DestinationSourceDefinition | null {
  return SOURCE_DEFINITIONS.find((source) => source.id === sourceId) ?? null
}

export function assertDestinationSourceUsable(
  sourceId: string,
  options: { allowHtml?: boolean } = {}
): DestinationSourceDefinition {
  const source = getDestinationSourceDefinition(sourceId)
  if (!source) {
    throw new DestinationSourceRegistryError(
      'SOURCE_NOT_REGISTERED',
      `Destination source ${sourceId} is not registered.`
    )
  }
  if (!source.enabled) {
    throw new DestinationSourceRegistryError('SOURCE_DISABLED', `Destination source ${sourceId} is disabled.`)
  }
  if (source.accessMethod === 'html' && !options.allowHtml) {
    throw new DestinationSourceRegistryError(
      'SOURCE_HTML_SCRAPING_DISABLED',
      `Destination source ${sourceId} uses HTML access, which is disabled by default.`
    )
  }
  if (!source.licenseName || !source.licenseUrl) {
    throw new DestinationSourceRegistryError(
      'SOURCE_LICENSE_MISSING',
      `Destination source ${sourceId} is missing reusable licence metadata.`
    )
  }
  if (source.commercialReuseAllowed === false) {
    throw new DestinationSourceRegistryError(
      'SOURCE_COMMERCIAL_REUSE_DISALLOWED',
      `Destination source ${sourceId} does not permit commercial reuse.`
    )
  }
  return { ...source }
}

export function attributionForSource(sourceId: string): string {
  const source = assertDestinationSourceUsable(sourceId)
  if (sourceId === 'openstreetmap-overpass') return '© OpenStreetMap contributors'
  if (sourceId === 'wikidata') return 'Wikidata, CC0'
  if (sourceId === 'wikivoyage') return 'Wikivoyage contributors, CC BY-SA 4.0'
  return source.name
}
