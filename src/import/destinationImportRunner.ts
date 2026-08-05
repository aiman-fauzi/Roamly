import { DestinationImportSource, type PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { slugify } from '@/import/normalization'
import type { DestinationImportSummary, ImportSourceConfig } from '@/import/types'
import { assertSourcePolicyAllowsUrl } from '@/services/destinations/facts/sourcePolicy'
import { DestinationImportService } from '@/services/import/destinationImportService'

const DEFAULT_LIMIT = 50
const DEFAULT_POLL_INTERVAL_MS = 1500

const IMPORT_COUNTRY_METADATA: Record<
  string,
  {
    name: string
    iso2: string
    iso3?: string
    currencyCode?: string
    phoneCode?: string
  }
> = {
  malaysia: { name: 'Malaysia', iso2: 'MY', iso3: 'MYS', currencyCode: 'MYR', phoneCode: '+60' },
  japan: { name: 'Japan', iso2: 'JP', iso3: 'JPN', currencyCode: 'JPY', phoneCode: '+81' },
  'united-states': { name: 'United States', iso2: 'US', iso3: 'USA', currencyCode: 'USD', phoneCode: '+1' },
  'united-kingdom': { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', currencyCode: 'GBP', phoneCode: '+44' },
  australia: { name: 'Australia', iso2: 'AU', iso3: 'AUS', currencyCode: 'AUD', phoneCode: '+61' },
}

export interface DestinationImportCliArgs {
  source: DestinationImportSource
  country: string
  city: string
  limit: number
}

interface DestinationImportRunnerOptions {
  db?: PrismaClient
  service?: Pick<DestinationImportService, 'import'>
  pollIntervalMs?: number
}

interface ProgressSnapshot {
  id: string
  status: string
  cursor: number
  totalRecords: number
  processedRecords: number
  skippedRecords: number
  failedRecords: number
}

function readCliValue(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`
  const inlineValue = argv.find((arg) => arg.startsWith(inlinePrefix))?.slice(inlinePrefix.length)
  if (inlineValue !== undefined) return inlineValue

  const valueIndex = argv.findIndex((arg) => arg === `--${name}`)
  return valueIndex >= 0 ? argv[valueIndex + 1] : undefined
}

function readSource(value: string | undefined): DestinationImportSource {
  switch (value?.trim().toLowerCase()) {
    case 'openstreetmap':
    case 'osm':
      return DestinationImportSource.OPENSTREETMAP
    case 'wikivoyage':
      return DestinationImportSource.WIKIVOYAGE
    case 'wikipedia':
      return DestinationImportSource.WIKIPEDIA
    case 'government':
    case 'government_tourism':
      return DestinationImportSource.GOVERNMENT_TOURISM
    default:
      throw new Error('Pass --source=openstreetmap|wikivoyage|wikipedia|government')
  }
}

function readRequiredText(argv: string[], name: string): string {
  const value = readCliValue(argv, name)?.trim()
  if (!value) throw new Error(`Pass --${name}=...`)
  return value
}

function readLimit(argv: string[]): number {
  const rawLimit = readCliValue(argv, 'limit')
  if (!rawLimit) return DEFAULT_LIMIT

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Pass --limit as a positive integer')
  }

  return limit
}

function escapeOverpassValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildOpenStreetMapUrl(args: DestinationImportCliArgs): string {
  const country = escapeOverpassValue(args.country)
  const city = escapeOverpassValue(args.city)
  const query = `
[out:json][timeout:60];
area["name"="${country}"]["boundary"="administrative"]["admin_level"="2"]->.countryArea;
area(area.countryArea)["name"="${city}"]->.searchArea;
(
  node(area.searchArea)["tourism"];
  way(area.searchArea)["tourism"];
  relation(area.searchArea)["tourism"];
  node(area.searchArea)["historic"];
  way(area.searchArea)["historic"];
  relation(area.searchArea)["historic"];
  node(area.searchArea)["amenity"~"restaurant|cafe|fast_food|place_of_worship"];
  way(area.searchArea)["amenity"~"restaurant|cafe|fast_food|place_of_worship"];
  relation(area.searchArea)["amenity"~"restaurant|cafe|fast_food|place_of_worship"];
  node(area.searchArea)["leisure"];
  way(area.searchArea)["leisure"];
  relation(area.searchArea)["leisure"];
);
out center ${args.limit};
`.trim()

  return `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
}

function buildMediaWikiUrl(args: DestinationImportCliArgs): string {
  if (args.source === DestinationImportSource.WIKIVOYAGE) {
    const linkedPageLimit = Math.min(100, Math.max(25, args.limit * 8))
    const params = new URLSearchParams({
      action: 'query',
      titles: args.city,
      generator: 'links',
      gplnamespace: '0',
      gpllimit: String(linkedPageLimit),
      redirects: '1',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      format: 'json',
      origin: '*',
    })

    return `https://en.wikivoyage.org/w/api.php?${params.toString()}`
  }

  const domain = 'en.wikipedia.org'
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${args.city} ${args.country} attractions restaurants hotels activities travel`,
    gsrlimit: String(args.limit),
    prop: 'coordinates|extracts',
    exintro: '1',
    explaintext: '1',
    format: 'json',
    origin: '*',
  })

  return `https://${domain}/w/api.php?${params.toString()}`
}

function buildGovernmentDatasetUrl(args: DestinationImportCliArgs): string {
  const datasetUrl = process.env.GOVERNMENT_TOURISM_DATASET_URL ?? process.env.DESTINATION_GOVERNMENT_DATASET_URL
  if (!datasetUrl) {
    throw new Error(
      'Government imports require GOVERNMENT_TOURISM_DATASET_URL or DESTINATION_GOVERNMENT_DATASET_URL.'
    )
  }

  const url = new URL(datasetUrl)
  url.searchParams.set('country', args.country)
  url.searchParams.set('city', args.city)
  url.searchParams.set('limit', String(args.limit))
  return url.toString()
}

function buildSourceUrl(args: DestinationImportCliArgs): string {
  switch (args.source) {
    case DestinationImportSource.OPENSTREETMAP:
      return buildOpenStreetMapUrl(args)
    case DestinationImportSource.WIKIVOYAGE:
    case DestinationImportSource.WIKIPEDIA:
      return buildMediaWikiUrl(args)
    case DestinationImportSource.GOVERNMENT_TOURISM:
      return buildGovernmentDatasetUrl(args)
  }
}

function formatSource(source: DestinationImportSource): string {
  return source.toLowerCase().replace(/_/g, '-')
}

function sourcePolicyKey(source: DestinationImportSource): string {
  switch (source) {
    case DestinationImportSource.OPENSTREETMAP:
      return 'openstreetmap'
    case DestinationImportSource.WIKIVOYAGE:
      return 'wikivoyage'
    case DestinationImportSource.WIKIPEDIA:
      return 'wikipedia'
    case DestinationImportSource.GOVERNMENT_TOURISM:
      return 'government-tourism'
  }
}

export function parseDestinationImportArgs(argv: string[]): DestinationImportCliArgs {
  return {
    source: readSource(readCliValue(argv, 'source')),
    country: readRequiredText(argv, 'country'),
    city: readRequiredText(argv, 'city'),
    limit: readLimit(argv),
  }
}

export function buildDestinationImportConfig(args: DestinationImportCliArgs): ImportSourceConfig {
  const countrySlug = slugify(args.country)
  const citySlug = slugify(args.city)
  const countryMetadata = IMPORT_COUNTRY_METADATA[countrySlug]
  const url = buildSourceUrl(args)
  assertSourcePolicyAllowsUrl(sourcePolicyKey(args.source), url)

  return {
    source: args.source,
    sourceKey: `${formatSource(args.source)}:${countrySlug}:${citySlug}:${args.limit}`,
    url,
    countryName: countryMetadata?.name ?? args.country,
    countrySlug,
    countryCode: countryMetadata?.iso2,
    countryIso3: countryMetadata?.iso3,
    currencyCode: countryMetadata?.currencyCode,
    phoneCode: countryMetadata?.phoneCode,
    citySlug,
    cityName: args.city,
    defaultKind: 'ATTRACTION',
    batchSize: args.limit,
    requestTimeoutMs: 60_000,
  }
}

async function readJobSnapshot(
  db: PrismaClient,
  config: ImportSourceConfig
): Promise<ProgressSnapshot | null> {
  const job = await db.destinationImportJob.findUnique({
    where: {
      source_sourceKey: {
        source: config.source,
        sourceKey: config.sourceKey,
      },
    },
    select: {
      id: true,
      status: true,
      cursor: true,
      totalRecords: true,
      processedRecords: true,
      skippedRecords: true,
      failedRecords: true,
    },
  })

  return job
}

function printProgress(snapshot: ProgressSnapshot) {
  const total = snapshot.totalRecords > 0 ? String(snapshot.totalRecords) : '?'
  const percentage = snapshot.totalRecords > 0 ? Math.round((snapshot.cursor / snapshot.totalRecords) * 100) : 0
  console.warn(
    `[import] ${snapshot.status} ${snapshot.cursor}/${total} (${percentage}%) | imported=${snapshot.processedRecords} skipped=${snapshot.skippedRecords} failed=${snapshot.failedRecords}`
  )
}

function printSummary(summary: DestinationImportSummary) {
  console.warn('[import] Summary')
  console.warn(`  jobId: ${summary.jobId}`)
  console.warn(`  status: ${summary.status}`)
  console.warn(`  fetched records: ${summary.fetchedRecords}`)
  console.warn(`  normalized records: ${summary.normalizedRecords}`)
  console.warn(`  accepted records: ${summary.acceptedRecords}`)
  console.warn(`  review records: ${summary.reviewRecords}`)
  console.warn(`  rejected records: ${summary.rejectedRecords}`)
  console.warn(`  created records: ${summary.createdRecords}`)
  console.warn(`  updated records: ${summary.updatedRecords}`)
  console.warn(`  persisted records: ${summary.processedRecords}`)
  console.warn(`  skipped records: ${summary.skippedRecords}`)
  console.warn(`  failed records: ${summary.failedRecords}`)
}

async function printAttractionSample(db: PrismaClient, config: ImportSourceConfig): Promise<number> {
  const where = {
    deletedAt: null,
    city: {
      slug: config.citySlug,
      country: {
        slug: config.countrySlug,
      },
    },
  }

  const [count, attractions] = await Promise.all([
    db.attraction.count({ where }),
    db.attraction.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { name: true, slug: true },
    }),
  ])

  console.warn(`[import] Verified attractions in database: ${count}`)
  if (attractions.length > 0) {
    console.warn('[import] Attraction sample:')
    for (const attraction of attractions) {
      console.warn(`  - ${attraction.name} (${attraction.slug})`)
    }
  }

  return count
}

async function waitForImportWithProgress(
  db: PrismaClient,
  config: ImportSourceConfig,
  importPromise: Promise<DestinationImportSummary>,
  pollIntervalMs: number
): Promise<DestinationImportSummary> {
  let lastPrinted = ''
  const timer = setInterval(() => {
    void readJobSnapshot(db, config)
      .then((snapshot) => {
        if (!snapshot) return
        const key = JSON.stringify(snapshot)
        if (key === lastPrinted) return
        lastPrinted = key
        printProgress(snapshot)
      })
      .catch((error) => {
        console.warn('[import] Progress polling failed', error instanceof Error ? error.message : error)
      })
  }, pollIntervalMs)

  try {
    return await importPromise
  } finally {
    clearInterval(timer)
    const finalSnapshot = await readJobSnapshot(db, config)
    if (finalSnapshot) printProgress(finalSnapshot)
  }
}

export async function runDestinationImportCli(
  argv: string[],
  options: DestinationImportRunnerOptions = {}
): Promise<number> {
  const db = options.db ?? prisma
  const args = parseDestinationImportArgs(argv)
  const config = buildDestinationImportConfig(args)
  const service = options.service ?? new DestinationImportService({ db })

  console.warn('[import] Destination import starting')
  console.warn(`  source: ${formatSource(args.source)}`)
  console.warn(`  country: ${args.country}`)
  console.warn(`  city: ${args.city}`)
  console.warn(`  limit: ${args.limit}`)
  console.warn(`  sourceKey: ${config.sourceKey}`)

  const existingJob = await readJobSnapshot(db, config)
  if (existingJob?.status === 'COMPLETED') {
    console.warn('[import] Completed import job already exists; skipping duplicate import.')
    printProgress(existingJob)
    printSummary({
      jobId: existingJob.id,
      status: 'COMPLETED',
      fetchedRecords: existingJob.totalRecords,
      normalizedRecords: existingJob.totalRecords,
      acceptedRecords: existingJob.processedRecords,
      reviewRecords: 0,
      rejectedRecords: existingJob.skippedRecords,
      createdRecords: 0,
      updatedRecords: 0,
      totalRecords: existingJob.totalRecords,
      processedRecords: existingJob.processedRecords,
      skippedRecords: existingJob.skippedRecords,
      failedRecords: existingJob.failedRecords,
    })
    const attractionCount = await printAttractionSample(db, config)
    return attractionCount > 0 ? 0 : 1
  }

  const summary = await waitForImportWithProgress(
    db,
    config,
    service.import(config),
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  )

  printSummary(summary)
  const attractionCount = await printAttractionSample(db, config)

  if (summary.status === 'FAILED' || summary.failedRecords > 0 || attractionCount === 0) return 1
  return 0
}
