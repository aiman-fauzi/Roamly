import { pathToFileURL } from 'node:url'

import { prisma } from '@/db/client'
import { resolveDestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import { DestinationImportPipelineService } from '@/services/destinations/importPipeline/destinationImportPipelineService'
import type { DestinationImportPipelineOptions } from '@/services/destinations/importPipeline/types'

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

function isResumeConfig(value: unknown): value is { area: { slug: string }; provider: 'osm'; limit: number; enrich?: boolean; maxEnrichmentRecords?: number; maxRequests?: number } {
  if (!value || typeof value !== 'object') return false
  const record = value as { area?: unknown; provider?: unknown; limit?: unknown }
  const area = record.area as { slug?: unknown } | undefined
  return Boolean(area?.slug && record.provider === 'osm' && typeof record.limit === 'number')
}

export async function runDestinationImportResumeCli(argv: string[]): Promise<number> {
  const jobId = readOption(argv, 'job-id')
  if (!jobId) throw new Error('Pass --job-id=<job-id>.')
  if (!hasFlag(argv, 'commit')) {
    throw new Error('Resume can write data; pass --commit explicitly after reviewing the failed job report.')
  }

  const job = await prisma.destinationImportJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error(`Destination import job not found: ${jobId}`)
  if (!isResumeConfig(job.config)) throw new Error('Job config is not an ASEAN destination import pipeline config.')

  const area = resolveDestinationImportArea(job.config.area.slug)
  if (!area) throw new Error(`Destination area no longer configured: ${job.config.area.slug}`)

  const options: DestinationImportPipelineOptions = {
    area,
    provider: 'osm',
    limit: job.config.limit,
    dryRun: false,
    commit: true,
    enrich: job.config.enrich ?? true,
    maxEnrichmentRecords: job.config.maxEnrichmentRecords ?? 5,
    maxRequests: job.config.maxRequests ?? 25,
  }
  const report = await new DestinationImportPipelineService({ db: prisma }).run(options)
  console.log(JSON.stringify(report, null, 2))
  return report.failedCount > 0 ? 1 : 0
}

async function main() {
  const exitCode = await runDestinationImportResumeCli(process.argv.slice(2))
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
