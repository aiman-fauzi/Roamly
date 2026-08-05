import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { DestinationSourceDownloader, type Fetcher } from '@/import/destinationSourceDownloader'
import { normalizeAndDedupe } from '@/import/normalizeDestinationRecords'
import { createParser } from '@/import/parsers'
import { evaluateDestinationRecords } from '@/import/relevance'
import { DestinationImportJobRepository } from '@/import/repositories/destinationImportJobRepository'
import { DestinationRepository } from '@/import/repositories/destinationRepository'
import type {
  DestinationImportSummary,
  DestinationRecordRejection,
  ImportSourceConfig,
  NormalizedDestinationRecord,
} from '@/import/types'

interface DestinationImportServiceOptions {
  db?: PrismaClient
  fetcher?: Fetcher
}

export class DestinationImportService {
  private readonly jobRepository: DestinationImportJobRepository
  private readonly destinationRepository: DestinationRepository
  private readonly downloader: DestinationSourceDownloader

  constructor(options: DestinationImportServiceOptions = {}) {
    const db = options.db ?? prisma
    this.jobRepository = new DestinationImportJobRepository(db)
    this.destinationRepository = new DestinationRepository(db)
    this.downloader = new DestinationSourceDownloader(options.fetcher)
  }

  private toRelevanceRejections(records: NormalizedDestinationRecord[]): DestinationRecordRejection[] {
    return records.map((record) => ({
      sourceId: record.sourceId,
      name: record.name,
      status: record.relevance?.status ?? 'REJECT',
      rejectionReasons: record.relevance?.rejectionReasons ?? ['LOW_RELEVANCE_SCORE'],
      relevanceScore: record.relevance?.relevanceScore,
      geographicDistanceKm: record.relevance?.geographicDistanceKm,
    }))
  }

  private logRejectedRecords(records: DestinationRecordRejection[]) {
    for (const record of records) {
      console.warn('Destination import relevance decision', record)
    }
  }

  async import(config: ImportSourceConfig): Promise<DestinationImportSummary> {
    const job = await this.jobRepository.start(config)
    let fetchedRecords = 0
    let normalizedRecords = 0
    let acceptedRecords = 0
    let reviewRecords = 0
    let rejectedRecords = 0
    let createdRecords = 0
    let updatedRecords = 0

    try {
      const payload = await this.downloader.download(config)
      const parser = createParser(config.source)
      const rawRecords = parser.parse(payload, config)
      fetchedRecords = rawRecords.length
      const limitedRawRecords = config.batchSize ? rawRecords.slice(0, config.batchSize) : rawRecords
      const normalized = normalizeAndDedupe(limitedRawRecords)
      normalizedRecords = normalized.records.length
      const evaluatedRecords = evaluateDestinationRecords(normalized.records, config)
      const accepted = evaluatedRecords.filter((record) => record.relevance?.status === 'ACCEPT')
      const review = evaluatedRecords.filter((record) => record.relevance?.status === 'REVIEW')
      const rejected = evaluatedRecords.filter((record) => record.relevance?.status === 'REJECT')

      acceptedRecords = accepted.length
      reviewRecords = review.length
      rejectedRecords = normalized.rejections.length + rejected.length

      this.logRejectedRecords([...this.toRelevanceRejections(review), ...this.toRelevanceRejections(rejected)])
      this.logRejectedRecords(normalized.rejections)

      await this.jobRepository.setTotal(job.id, accepted.length)

      const skippedByValidation = normalized.skipped + review.length + rejected.length
      if (job.cursor === 0 && skippedByValidation > 0) {
        await this.jobRepository.addSkipped(job.id, skippedByValidation)
      }

      if (normalized.records.length === 0 || accepted.length === 0) {
        const failed = await this.jobRepository.fail(
          job.id,
          rawRecords.length === 0
            ? 'Destination import source returned no records.'
            : normalized.records.length === 0
              ? 'Destination import produced no usable normalized records.'
              : 'Destination import accepted no records after relevance validation.'
        )
        return {
          jobId: failed.id,
          status: 'FAILED',
          fetchedRecords,
          normalizedRecords,
          acceptedRecords,
          reviewRecords,
          rejectedRecords,
          createdRecords,
          updatedRecords,
          totalRecords: failed.totalRecords,
          processedRecords: failed.processedRecords,
          skippedRecords: failed.skippedRecords,
          failedRecords: failed.failedRecords,
        }
      }

      for (let index = job.cursor; index < accepted.length; index += 1) {
        const record = accepted[index]
        try {
          const result = await this.destinationRepository.importRecord(record)
          if (result.status === 'created') createdRecords += 1
          if (result.status === 'updated') updatedRecords += 1
          await this.jobRepository.checkpoint(
            job.id,
            index + 1,
            result.status === 'skipped' ? 'skipped' : 'processed'
          )
        } catch (error) {
          await this.jobRepository.checkpoint(job.id, index + 1, 'failed')
          console.warn('Destination import skipped failed record', {
            sourceId: record.sourceId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      if (job.processedRecords + createdRecords + updatedRecords === 0) {
        const failed = await this.jobRepository.fail(
          job.id,
          'Destination import persisted no destination records.'
        )
        return {
          jobId: failed.id,
          status: 'FAILED',
          fetchedRecords,
          normalizedRecords,
          createdRecords,
          updatedRecords,
          acceptedRecords,
          reviewRecords,
          rejectedRecords,
          totalRecords: failed.totalRecords,
          processedRecords: failed.processedRecords,
          skippedRecords: failed.skippedRecords,
          failedRecords: failed.failedRecords,
        }
      }

      const completed = await this.jobRepository.complete(job.id)
      return {
        jobId: completed.id,
        status: 'COMPLETED',
        fetchedRecords,
        normalizedRecords,
        acceptedRecords,
        reviewRecords,
        rejectedRecords,
        createdRecords,
        updatedRecords,
        totalRecords: completed.totalRecords,
        processedRecords: completed.processedRecords,
        skippedRecords: completed.skippedRecords,
        failedRecords: completed.failedRecords,
      }
    } catch (error) {
      const failed = await this.jobRepository.fail(
        job.id,
        error instanceof Error ? error.message : 'Unknown import failure'
      )
      return {
        jobId: failed.id,
        status: 'FAILED',
        fetchedRecords,
        normalizedRecords,
        acceptedRecords,
        reviewRecords,
        rejectedRecords,
        createdRecords,
        updatedRecords,
        totalRecords: failed.totalRecords,
        processedRecords: failed.processedRecords,
        skippedRecords: failed.skippedRecords,
        failedRecords: failed.failedRecords,
      }
    }
  }
}
