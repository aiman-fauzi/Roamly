import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { resolveDestinationEnrichmentProvider } from '@/enrichment/providers'
import { DestinationEnrichmentJobRepository } from '@/enrichment/repositories/destinationEnrichmentJobRepository'
import { DestinationEnrichmentRepository } from '@/enrichment/repositories/destinationEnrichmentRepository'
import type {
  DestinationEnrichmentJobSummary,
  DestinationEnrichmentProvider,
} from '@/enrichment/types'

interface DestinationEnrichmentServiceOptions {
  db?: PrismaClient
  provider?: DestinationEnrichmentProvider
}

interface RunOptions {
  sourceKey?: string
  batchSize?: number
}

export class DestinationEnrichmentService {
  private readonly jobRepository: DestinationEnrichmentJobRepository
  private readonly enrichmentRepository: DestinationEnrichmentRepository
  private readonly provider: DestinationEnrichmentProvider

  constructor(options: DestinationEnrichmentServiceOptions = {}) {
    const db = options.db ?? prisma
    this.jobRepository = new DestinationEnrichmentJobRepository(db)
    this.enrichmentRepository = new DestinationEnrichmentRepository(db)
    this.provider = options.provider ?? resolveDestinationEnrichmentProvider()
  }

  async runBackgroundJob(options: RunOptions = {}): Promise<DestinationEnrichmentJobSummary> {
    const batchSize = options.batchSize ?? 25
    const job = await this.jobRepository.start(options.sourceKey ?? 'destination-enrichment', batchSize)
    let processedRecords = 0
    let failedRecords = 0

    try {
      const destinations = await this.enrichmentRepository.findPendingDestinations(batchSize)

      for (const destination of destinations) {
        try {
          const enrichment = await this.provider.generate(destination)
          await this.enrichmentRepository.save(destination, enrichment)
          await this.jobRepository.checkpoint(job.id, 'processed')
          processedRecords += 1
        } catch (error) {
          await this.jobRepository.checkpoint(job.id, 'failed')
          failedRecords += 1
          console.warn('Destination enrichment failed for record', {
            destinationId: destination.id,
            kind: destination.kind,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      if (destinations.length > 0 && processedRecords === 0 && failedRecords > 0) {
        const failed = await this.jobRepository.fail(
          job.id,
          'Destination enrichment persisted no enrichment records.'
        )
        return {
          jobId: failed.id,
          status: 'FAILED',
          processedRecords: failed.processedRecords,
          skippedRecords: failed.skippedRecords,
          failedRecords: failed.failedRecords,
        }
      }

      const completed = await this.jobRepository.complete(job.id)
      return {
        jobId: completed.id,
        status: 'COMPLETED',
        processedRecords: completed.processedRecords,
        skippedRecords: completed.skippedRecords,
        failedRecords: completed.failedRecords,
      }
    } catch (error) {
      const failed = await this.jobRepository.fail(
        job.id,
        error instanceof Error ? error.message : 'Unknown enrichment failure'
      )
      return {
        jobId: failed.id,
        status: 'FAILED',
        processedRecords: failed.processedRecords,
        skippedRecords: failed.skippedRecords,
        failedRecords: failed.failedRecords,
      }
    }
  }
}
