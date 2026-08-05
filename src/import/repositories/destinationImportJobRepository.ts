import type { DestinationImportJob, Prisma, PrismaClient } from '@prisma/client'

import type { ImportSourceConfig } from '@/import/types'

export class DestinationImportJobRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(config: ImportSourceConfig): Promise<DestinationImportJob> {
    const existing = await this.db.destinationImportJob.findUnique({
      where: {
        source_sourceKey: {
          source: config.source,
          sourceKey: config.sourceKey,
        },
      },
    })

    const shouldReset = existing?.status === 'COMPLETED'
    const cursor = shouldReset ? 0 : existing?.cursor ?? 0

    return this.db.destinationImportJob.upsert({
      where: {
        source_sourceKey: {
          source: config.source,
          sourceKey: config.sourceKey,
        },
      },
      update: {
        status: 'RUNNING',
        cursor,
        processedRecords: shouldReset ? 0 : undefined,
        skippedRecords: shouldReset ? 0 : undefined,
        failedRecords: shouldReset ? 0 : undefined,
        config: config as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
      create: {
        source: config.source,
        sourceKey: config.sourceKey,
        status: 'RUNNING',
        cursor: 0,
        config: config as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    })
  }

  async setTotal(jobId: string, totalRecords: number) {
    await this.db.destinationImportJob.update({
      where: { id: jobId },
      data: { totalRecords },
    })
  }

  async addSkipped(jobId: string, skippedRecords: number) {
    await this.db.destinationImportJob.update({
      where: { id: jobId },
      data: { skippedRecords: { increment: skippedRecords } },
    })
  }

  async checkpoint(jobId: string, cursor: number, result: 'processed' | 'skipped' | 'failed') {
    await this.db.destinationImportJob.update({
      where: { id: jobId },
      data: {
        cursor,
        processedRecords: result === 'processed' ? { increment: 1 } : undefined,
        skippedRecords: result === 'skipped' ? { increment: 1 } : undefined,
        failedRecords: result === 'failed' ? { increment: 1 } : undefined,
      },
    })
  }

  async complete(jobId: string): Promise<DestinationImportJob> {
    return this.db.destinationImportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errorMessage: null,
      },
    })
  }

  async fail(jobId: string, errorMessage: string): Promise<DestinationImportJob> {
    return this.db.destinationImportJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage,
        completedAt: new Date(),
      },
    })
  }
}
