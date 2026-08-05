import { DestinationImportSource, type PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { DestinationCleanupService } from '@/services/destinations/destinationCleanupService'
import type {
  DestinationCleanupDecision,
  DestinationCleanupSummary,
} from '@/services/destinations/types'

export interface DestinationCleanupCliArgs {
  source?: DestinationImportSource
  city?: string
  ids?: string[]
  apply: boolean
}

function readOption(argv: string[], name: string): string | undefined {
  const exactIndex = argv.indexOf(`--${name}`)
  if (exactIndex >= 0) return argv[exactIndex + 1]

  const prefix = `--${name}=`
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

function readSource(value: string | undefined): DestinationImportSource | undefined {
  if (!value) return DestinationImportSource.WIKIVOYAGE
  const normalized = value.trim().toLowerCase()
  if (normalized === 'wikivoyage') return DestinationImportSource.WIKIVOYAGE
  if (normalized === 'wikipedia') return DestinationImportSource.WIKIPEDIA
  if (normalized === 'openstreetmap' || normalized === 'osm') {
    return DestinationImportSource.OPENSTREETMAP
  }
  if (normalized === 'government_tourism' || normalized === 'government-tourism') {
    return DestinationImportSource.GOVERNMENT_TOURISM
  }
  throw new Error(`Unsupported cleanup source: ${value}`)
}

function readIds(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.length > 0 ? ids : undefined
}

export function parseDestinationCleanupArgs(argv: string[]): DestinationCleanupCliArgs {
  const apply = hasFlag(argv, 'apply')
  const dryRun = hasFlag(argv, 'dry-run')
  if (apply && dryRun) {
    throw new Error('Pass either --dry-run or --apply, not both.')
  }

  return {
    source: readSource(readOption(argv, 'source')),
    city: readOption(argv, 'city'),
    ids: readIds(readOption(argv, 'ids')),
    apply,
  }
}

function printCounts(label: string, counts: DestinationCleanupSummary['beforeCounts']) {
  console.warn(`[cleanup] ${label}`)
  console.warn(`  attractions: ${counts.attractions}`)
  console.warn(`  restaurants: ${counts.restaurants}`)
  console.warn(`  hotels: ${counts.hotels}`)
  console.warn(`  activities: ${counts.activities}`)
}

function formatDecision(decision: DestinationCleanupDecision): string {
  const record = decision.record
  const refs = record.referencedByTripsOrItineraries
    .map((reference) => `${reference.title} (${reference.id})`)
    .join(', ')
  return [
    `${decision.recommendedAction}: ${record.entityTable}/${record.id}`,
    `  name: ${record.name}`,
    `  source: ${record.source}`,
    `  source URL or ID: ${record.sourceUrlOrIdentifier}`,
    `  coordinates: ${record.latitude ?? 'unknown'}, ${record.longitude ?? 'unknown'}`,
    `  enrichment: ${record.enrichmentId ?? 'none'}`,
    `  trip/itinerary refs: ${refs || 'none'}`,
    `  safeToApply: ${decision.safeToApply ? 'yes' : 'no'}`,
    `  reasons: ${decision.reasons.join(', ')}`,
  ].join('\n')
}

function printSummary(summary: DestinationCleanupSummary) {
  console.warn(`[cleanup] mode: ${summary.mode}`)
  printCounts('before active counts', summary.beforeCounts)
  console.warn(`[cleanup] inspected records: ${summary.inspectedRecords}`)
  console.warn(`[cleanup] affected records: ${summary.affectedRecords}`)
  for (const decision of summary.decisions) {
    if (decision.recommendedAction === 'RETAIN' && !decision.safeToApply) continue
    console.warn(formatDecision(decision))
  }
  printCounts('after active counts', summary.afterCounts)
}

export async function runDestinationCleanupCli(
  argv: string[],
  options: { db?: PrismaClient; service?: DestinationCleanupService } = {}
): Promise<number> {
  const args = parseDestinationCleanupArgs(argv)
  const db = options.db ?? prisma
  const service = options.service ?? new DestinationCleanupService(db)

  if (!args.apply) {
    console.warn('[cleanup] dry-run is the default. Re-run with --apply to quarantine safe records.')
  }

  const summary = await service.run({
    source: args.source,
    city: args.city,
    ids: args.ids,
    apply: args.apply,
  })

  printSummary(summary)
  return 0
}
