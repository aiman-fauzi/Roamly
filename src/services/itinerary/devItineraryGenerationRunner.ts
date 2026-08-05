import type { ItineraryGenerationService } from '@/services/itinerary/itineraryGenerationService'
import {
  ItineraryGenerationError,
  ItineraryGenerationService as DefaultItineraryGenerationService,
} from '@/services/itinerary/itineraryGenerationService'

export interface DevItineraryGenerationArgs {
  tripId: string
  maxCandidates: number
  persist: boolean
  printContextSummary: boolean
}

interface DevRunnerOptions {
  service?: Pick<ItineraryGenerationService, 'generate'>
  env?: NodeJS.ProcessEnv
}

function readDefaultMaxCandidates(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.ITINERARY_MAX_CANDIDATES)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 6
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  if (index >= 0) return argv[index + 1]

  const prefix = `--${name}=`
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Pass --maxCandidates as a positive integer.')
  }
  return parsed
}

export function parseDevItineraryGenerationArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): DevItineraryGenerationArgs {
  const persist = hasFlag(argv, 'persist')
  const dryRun = hasFlag(argv, 'dry-run')
  if (persist && dryRun) {
    throw new Error('Pass either --dry-run or --persist, not both.')
  }

  const tripId = readOption(argv, 'tripId')
  if (!tripId) throw new Error('Pass --tripId=<trip-id>.')

  return {
    tripId,
    maxCandidates: readPositiveInteger(readOption(argv, 'maxCandidates'), readDefaultMaxCandidates(env)),
    persist,
    printContextSummary: hasFlag(argv, 'print-context-summary'),
  }
}

function printHeader(args: DevItineraryGenerationArgs) {
  console.warn('[itinerary:dev] controlled itinerary generation')
  console.warn(`  tripId: ${args.tripId}`)
  console.warn(`  mode: ${args.persist ? 'persist' : 'dry-run'}`)
  console.warn(`  maxCandidates: ${args.maxCandidates}`)
  if (!args.persist) {
    console.warn('  persistence: disabled; re-run with --persist to save a validated itinerary')
  }
}

function printSummary(summary: Awaited<ReturnType<ItineraryGenerationService['generate']>>['summary']) {
  console.warn('[itinerary:dev] candidate summary')
  console.warn(`  destination: ${summary.destination}`)
  console.warn(`  city: ${summary.cityName} (${summary.cityId})`)
  console.warn(`  eligible candidates: ${summary.eligibleCandidates}`)
  console.warn(`  candidates sent: ${summary.candidatesSent}`)
  console.warn(`  omitted candidates: ${summary.candidatesOmitted}`)
  console.warn(
    `  candidate types: ATTRACTION=${summary.candidateTypeCounts.ATTRACTION}, RESTAURANT=${summary.candidateTypeCounts.RESTAURANT}, HOTEL=${summary.candidateTypeCounts.HOTEL}, ACTIVITY=${summary.candidateTypeCounts.ACTIVITY}`
  )
  console.warn(`  known opening-hours count: ${summary.knownOpeningHoursCount}`)
  console.warn(`  known-price count: ${summary.knownPriceCount}`)
  console.warn(`  stale-fact count: ${summary.staleFactCount}`)
  console.warn(`  raw context size: ${summary.contextRawSerializedSize}`)
  console.warn(`  compact context size: ${summary.contextSerializedSize}/${summary.contextMaxSerializedSize}`)
  console.warn('[itinerary:dev] supplied candidates')
  for (const candidate of summary.candidateIds) {
    const readiness = candidate.readinessDecision
      ? ` | readiness ${candidate.readinessDecision}:${candidate.readinessScore ?? 'unknown'}`
      : ''
    const preferences = candidate.preferenceMatches?.length
      ? ` | preference ${candidate.preferenceMatches.join(',')}`
      : ''
    const penalties = candidate.penaltiesApplied?.length
      ? ` | penalties ${candidate.penaltiesApplied.join(',')}`
      : ''
    console.warn(`  - ${candidate.id} | ${candidate.type} | ${candidate.name} | rank ${candidate.rankScore}${readiness}${preferences}${penalties}`)
  }
  console.warn('[itinerary:dev] Gemini validation')
  console.warn(`  request latency: ${summary.generationLatencyMs}ms`)
  console.warn(`  items returned: ${summary.geminiItemsReturned}`)
  console.warn(`  valid items: ${summary.validItems}`)
  console.warn(`  rejected items: ${summary.rejectedItems}`)
  console.warn(`  returned candidate IDs: ${summary.returnedCandidateIds.join(', ') || 'none'}`)
  if (summary.returnedCandidateDetails.length > 0) {
    console.warn('[itinerary:dev] returned candidate detail')
    for (const candidate of summary.returnedCandidateDetails) {
      const deletionNote = candidate.deletedAt ? ` | deletedAt ${candidate.deletedAt}` : ''
      console.warn(`  - ${candidate.id} | ${candidate.allowed ? 'allowed' : 'unsupported'} | ${candidate.name ?? 'name unavailable'}${deletionNote}`)
    }
  }
  console.warn(`  unsupported candidate IDs: ${summary.unsupportedCandidateIds.join(', ') || 'none'}`)
  if (summary.unsupportedCandidateDetails.length > 0) {
    console.warn('[itinerary:dev] unsupported candidate detail')
    for (const candidate of summary.unsupportedCandidateDetails) {
      const deletionNote = candidate.deletedAt ? ` | deletedAt ${candidate.deletedAt}` : ''
      console.warn(`  - ${candidate.id} | ${candidate.name ?? 'name unavailable'}${deletionNote}`)
    }
  }
  console.warn(`  unknown candidate IDs: ${summary.unknownCandidateIds.join(', ') || 'none'}`)
  console.warn(`  duplicate candidate IDs: ${summary.duplicateCandidateIds.join(', ') || 'none'}`)
  console.warn(`  schema/contract validation: ${summary.validationStatus}`)
  if (summary.validationIssues.length > 0) {
    console.warn('[itinerary:dev] rejected item reasons')
    for (const issue of summary.validationIssues) console.warn(`  - ${issue}`)
  }
  console.warn('[itinerary:dev] persistence')
  console.warn(`  persisted: ${summary.persisted ? 'yes' : 'no'}`)
  console.warn(`  result: ${summary.persistenceResult ?? 'none'}`)
}

export async function runDevItineraryGenerationCli(
  argv: string[],
  options: DevRunnerOptions = {}
): Promise<number> {
  const env = options.env ?? process.env
  if (env.NODE_ENV === 'production') {
    console.error('[itinerary:dev] refused to run in production.')
    return 1
  }

  const args = parseDevItineraryGenerationArgs(argv, env)
  printHeader(args)

  const service = options.service ?? new DefaultItineraryGenerationService()

  try {
    const result = await service.generate({
      tripId: args.tripId,
      maxCandidates: args.maxCandidates,
      persist: args.persist,
    })
    printSummary(result.summary)

    if (args.printContextSummary) {
      console.warn('[itinerary:dev] context detail')
      console.warn(`  candidate context records: ${result.destinationContext.candidates.length}`)
      console.warn(`  clusters: ${result.destinationContext.clusters.length}`)
      console.warn(`  nearest-neighbor rows: ${result.destinationContext.nearestNeighbors.length}`)
    }

    return 0
  } catch (error) {
    if (error instanceof ItineraryGenerationError) {
      console.error(`[itinerary:dev] ${error.code}: ${error.message}`)
      const nestedDetails =
        error.details && typeof error.details === 'object' && 'details' in error.details
          ? (error.details as { details?: unknown }).details
          : error.details
      if (nestedDetails && typeof nestedDetails === 'object' && 'validationStatus' in nestedDetails) {
        printSummary((nestedDetails as { validationStatus: string } & Parameters<typeof printSummary>[0]))
      } else if (nestedDetails && typeof nestedDetails === 'object' && 'validationIssues' in nestedDetails) {
        const details = nestedDetails as { validationIssues?: unknown }
        if (Array.isArray(details.validationIssues)) {
          console.error('[itinerary:dev] rejected item reasons')
          for (const issue of details.validationIssues) console.error(`  - ${String(issue)}`)
        }
      }
      return 1
    }

    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}
