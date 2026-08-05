import type { DestinationEnrichmentJob, PrismaClient } from '@prisma/client'

export class DestinationEnrichmentJobRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(sourceKey: string, batchSize: number): Promise<DestinationEnrichmentJob> {
    const existing = await this.db.destinationEnrichmentJob.findUnique({ where: { sourceKey } })
    const shouldReset = existing?.status === 'COMPLETED'

    return this.db.destinationEnrichmentJob.upsert({
      where: { sourceKey },
      update: {
        status: 'RUNNING',
        batchSize,
        processedRecords: shouldReset ? 0 : undefined,
        skippedRecords: shouldReset ? 0 : undefined,
        failedRecords: shouldReset ? 0 : undefined,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
      create: {
        sourceKey,
        status: 'RUNNING',
        batchSize,
        startedAt: new Date(),
      },
    })
  }

  async checkpoint(jobId: string, result: 'processed' | 'skipped' | 'failed') {
    await this.db.destinationEnrichmentJob.update({
      where: { id: jobId },
      data: {
        processedRecords: result === 'processed' ? { increment: 1 } : undefined,
        skippedRecords: result === 'skipped' ? { increment: 1 } : undefined,
        failedRecords: result === 'failed' ? { increment: 1 } : undefined,
      },
    })
  }

  async complete(jobId: string): Promise<DestinationEnrichmentJob> {
    return this.db.destinationEnrichmentJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errorMessage: null,
      },
    })
  }

  async fail(jobId: string, errorMessage: string): Promise<DestinationEnrichmentJob> {
    return this.db.destinationEnrichmentJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
      },
    })
  }
}
