import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { prisma } from '@/db/client'
import {
  listDestinationImportAreas,
  resolveDestinationImportArea,
} from '@/services/destinations/importPipeline/destinationAreas'
import { DestinationImportPipelineService } from '@/services/destinations/importPipeline/destinationImportPipelineService'
import type {
  DestinationImportPipelineOptions,
  DestinationImportPipelineReport,
  DestinationImportPilotManifest,
} from '@/services/destinations/importPipeline/types'

interface CliArgs {
  area?: string
  country?: string
  allAreas: boolean
  pilotsOnly: boolean
  provider: 'osm'
  limit: number
  dryRun: boolean
  commit: boolean
  enrich: boolean
  maxEnrichmentRecords: number
  maxRequests: number
  json: boolean
  manifestPath?: string
}

function readOption(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`
  const inline = argv.find((arg) => arg.startsWith(inlinePrefix))?.slice(inlinePrefix.length)
  if (inline !== undefined) return inline
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

function readPositiveInteger(value: string | undefined, fallback: number, name = 'value'): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Pass --${name} as a positive integer.`)
  return parsed
}

function parseProvider(value: string | undefined): 'osm' {
  if (!value || value === 'osm' || value === 'openstreetmap') return 'osm'
  throw new Error('Only --provider=osm is supported in this pipeline phase.')
}

export function parseDestinationImportPipelineArgs(argv: string[]): CliArgs {
  const commit = hasFlag(argv, 'commit')
  const dryRun = hasFlag(argv, 'dry-run') || !commit
  if (commit && hasFlag(argv, 'dry-run')) throw new Error('Pass either --dry-run or --commit, not both.')

  return {
    area: readOption(argv, 'area'),
    country: readOption(argv, 'country')?.toUpperCase(),
    allAreas: hasFlag(argv, 'all-areas'),
    pilotsOnly: hasFlag(argv, 'pilots'),
    provider: parseProvider(readOption(argv, 'provider')),
    limit: readPositiveInteger(readOption(argv, 'limit'), 20, 'limit'),
    dryRun,
    commit,
    enrich: !hasFlag(argv, 'no-enrich'),
    maxEnrichmentRecords: readPositiveInteger(readOption(argv, 'maxEnrichmentRecords'), 5, 'maxEnrichmentRecords'),
    maxRequests: readPositiveInteger(readOption(argv, 'maxRequests'), 25, 'maxRequests'),
    json: hasFlag(argv, 'json'),
    manifestPath: readOption(argv, 'manifest'),
  }
}

function resolveAreas(args: CliArgs) {
  if (args.area) {
    const area = resolveDestinationImportArea(args.area)
    if (!area) throw new Error(`Destination area not configured: ${args.area}`)
    return [area]
  }

  if (!args.allAreas) throw new Error('Pass --area=<slug>, or --all-areas with optional --country=<ISO2>.')

  return listDestinationImportAreas({ pilotsOnly: args.pilotsOnly })
    .filter((area) => !args.country || area.countryCode === args.country)
}

async function readManifest(pathValue: string | undefined): Promise<DestinationImportPilotManifest | null> {
  if (!pathValue) return null
  const parsed = JSON.parse((await readFile(path.resolve(pathValue), 'utf8')).replace(/^\uFEFF/, '')) as unknown
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { candidates?: unknown }).candidates)) {
    throw new Error(`Manifest file is malformed: ${pathValue}`)
  }
  const manifest = parsed as DestinationImportPilotManifest
  verifyManifestChecksums(manifest, pathValue)
  return manifest
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function verifyManifestChecksums(manifest: DestinationImportPilotManifest, pathValue: string) {
  const rowHashes = manifest.candidates.map((candidate) => {
    if (!candidate.contentHash) return null
    const candidateWithoutHash = { ...candidate }
    delete candidateWithoutHash.contentHash
    const expected = sha256(stableJson(candidateWithoutHash))
    if (candidate.contentHash !== expected) {
      throw new Error(`Manifest candidate checksum mismatch for ${candidate.sourceRecordId ?? candidate.sourceId}.`)
    }
    return candidate.contentHash
  })

  if (manifest.candidateSetChecksum) {
    if (rowHashes.some((hash) => !hash)) {
      throw new Error(`Manifest ${pathValue} has a set checksum but at least one candidate is missing contentHash.`)
    }
    const expected = sha256(stableJson(rowHashes))
    if (manifest.candidateSetChecksum !== expected) {
      throw new Error(`Manifest candidate set checksum mismatch: ${pathValue}`)
    }
  }
}

function optionsFor(
  args: CliArgs,
  area: ReturnType<typeof resolveAreas>[number],
  manifest: DestinationImportPilotManifest | null
): DestinationImportPipelineOptions {
  return {
    area,
    provider: args.provider,
    limit: args.limit,
    dryRun: args.dryRun,
    commit: args.commit,
    enrich: args.enrich,
    maxEnrichmentRecords: args.maxEnrichmentRecords,
    maxRequests: args.maxRequests,
    manifest,
  }
}

function printReport(report: DestinationImportPipelineReport) {
  console.warn('[destinations:import] ASEAN destination import pipeline')
  console.warn(`  jobId: ${report.jobId}`)
  console.warn(`  area: ${report.area.name}, ${report.area.countryName} (${report.area.slug})`)
  console.warn(`  mode: ${report.dryRun ? 'dry-run' : 'commit'}`)
  console.warn(`  provider: ${report.provider}`)
  console.warn(`  requests: ${report.requestCount}`)
  console.warn(`  discovered: ${report.discoveredCount}`)
  console.warn(`  accepted new: ${report.summary.acceptedNew}`)
  console.warn(`  manual review: ${report.summary.manualReview}`)
  console.warn(`  rejected new: ${report.summary.rejectedNew}`)
  console.warn(`  existing exact matches: ${report.summary.existingExactMatches}`)
  console.warn(`  existing no-change: ${report.summary.existingNoChange}`)
  console.warn(`  safe updates: ${report.summary.safeUpdates}`)
  console.warn(`  duplicates: ${report.duplicateCount}`)
  console.warn(`  proposed inserts: ${report.proposedInserts.length}`)
  console.warn(`  proposed updates: ${report.proposedUpdates.length}`)
  console.warn(`  skipped: ${report.skippedCount}`)
  console.warn(`  local-name-only: ${report.localNameOnlyCount}`)
  console.warn(`  english-name coverage: ${report.englishNameCoverage.count}/${report.englishNameCoverage.total} (${report.englishNameCoverage.percent}%)`)
  console.warn(`  wikidata coverage: ${report.wikidataCoverage.count}/${report.wikidataCoverage.total} (${report.wikidataCoverage.percent}%)`)
  console.warn(`  licensed-image coverage: ${report.licensedImageCoverage.count}/${report.licensedImageCoverage.total} (${report.licensedImageCoverage.percent}%)`)
  console.warn(`  categories: ${JSON.stringify(report.categoryDistribution)}`)
  console.warn(`  osm object types: ${JSON.stringify(report.osmObjectTypeDistribution)}`)
  console.warn(`  duplicate decisions: ${JSON.stringify(report.duplicateDecisionDistribution)}`)
  if (Object.keys(report.rejectionReasonDistribution).length > 0) {
    console.warn(`  rejection reasons: ${JSON.stringify(report.rejectionReasonDistribution)}`)
  }
  if (Object.keys(report.reviewReasonDistribution).length > 0) {
    console.warn(`  review reasons: ${JSON.stringify(report.reviewReasonDistribution)}`)
  }
  if (report.acceptedExamples.length > 0) {
    console.warn('  accepted examples:')
    for (const decision of report.acceptedExamples) {
      console.warn(
        `    - ${decision.candidate.name} | ${decision.candidate.category} | ${decision.importReadiness.score}`
      )
    }
  }
  if (report.reviewExamples.length > 0) {
    console.warn('  review examples:')
    for (const decision of report.reviewExamples.slice(0, 5)) {
      console.warn(
        `    - ${decision.candidate.sourceRecordId} | ${decision.candidate.name} | ${decision.importReadiness.reasons.join(',')}`
      )
    }
  }
  if (report.rejectedExamples.length > 0) {
    console.warn('  rejected examples:')
    for (const decision of report.rejectedExamples) {
      console.warn(
        `    - ${decision.candidate.sourceRecordId} | ${decision.candidate.name} | ${decision.validationReasons.join(',') || decision.importReadiness.reasons.join(',')}`
      )
    }
  }
  if (report.duplicateDiagnostics.length > 0) {
    console.warn('  duplicate examples:')
    for (const decision of report.duplicateDiagnostics.slice(0, 5)) {
      const diagnostic = decision.duplicateDiagnostic
      console.warn(
        `    - ${decision.candidate.sourceRecordId} -> ${diagnostic?.mergeTarget ?? decision.duplicateOf ?? 'unknown'} | ${diagnostic?.matchedFields.join(',') ?? 'unknown'} | ${decision.duplicateConfidence}`
      )
    }
  }
  if (report.diagnosticsFilePath) console.warn(`  diagnostics file: ${report.diagnosticsFilePath}`)
}

async function writeDiagnosticsReport(report: DestinationImportPipelineReport): Promise<DestinationImportPipelineReport> {
  if (report.decisions.length <= 50) return report
  const directory = process.env.ROAMLY_IMPORT_REPORT_DIR ?? path.join(process.cwd(), '.tmp', 'destination-import-reports')
  await mkdir(directory, { recursive: true })
  const safeJobId = report.jobId.replace(/[^a-z0-9._-]+/gi, '_')
  const filePath = path.join(directory, `${safeJobId}.json`)
  const completeReport = { ...report, diagnosticsFilePath: filePath }
  await writeFile(filePath, JSON.stringify(completeReport, null, 2), 'utf8')
  return completeReport
}

export async function runDestinationImportPipelineCli(argv: string[]): Promise<number> {
  const args = parseDestinationImportPipelineArgs(argv)
  const areas = resolveAreas(args)
  if (areas.length === 0) throw new Error('No enabled destination areas matched the requested filters.')
  const manifest = await readManifest(args.manifestPath)

  const service = new DestinationImportPipelineService()
  const reports: DestinationImportPipelineReport[] = []
  for (const area of areas) {
    const report = await writeDiagnosticsReport(await service.run(optionsFor(args, area, manifest)))
    reports.push(report)
    if (!args.json) printReport(report)
  }

  if (args.json) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2))
  return reports.some((report) => report.failedCount > 0 || report.errorSummary) ? 1 : 0
}

async function main() {
  const exitCode = await runDestinationImportPipelineCli(process.argv.slice(2))
  process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => {
      void prisma.$disconnect()
    })
}
