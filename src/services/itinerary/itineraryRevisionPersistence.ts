import type { Prisma, Trip, TripStatus } from '@prisma/client'

import { prisma } from '@/db/client'
import type { RequestTiming } from '@/lib/observability/requestTiming'
import type { Itinerary, ItineraryRevisionAction } from '@/types/itinerary'

const DEFAULT_REVISION_LIMIT = 20
const MAX_REVISION_LIMIT = 100

function configuredRevisionLimit(): number {
  const configured = Number(process.env.ITINERARY_REVISION_LIMIT)
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_REVISION_LIMIT
  return Math.min(configured, MAX_REVISION_LIMIT)
}

export const ITINERARY_REVISION_LIMIT = configuredRevisionLimit()

export function expiredRevisionIds(
  revisions: Array<{ id: string; revisionNumber: number }>,
  limit = ITINERARY_REVISION_LIMIT
): string[] {
  return [...revisions]
    .sort((first, second) => second.revisionNumber - first.revisionNumber)
    .slice(limit)
    .map(({ id }) => id)
}

export interface PersistItineraryMutationInput {
  tripId: string
  userId: string
  expectedVersion: number
  previousItinerary: Itinerary
  nextItinerary: Itinerary
  actionType: ItineraryRevisionAction
  actionSummary: string
  timing?: RequestTiming
}

export interface PersistItineraryMutationResult {
  updated: boolean
  revisionCount: number
  deletedRevisionCount: number
}

async function cleanRevisionHistory(
  tx: Prisma.TransactionClient,
  tripId: string,
  timing?: RequestTiming
): Promise<{ revisionCount: number; deletedRevisionCount: number }> {
  const cleanup = async () => {
    const revisions = await tx.itineraryRevision.findMany({
      where: { tripId },
      orderBy: { revisionNumber: 'desc' },
      select: { id: true, revisionNumber: true },
    })
    const expiredIds = expiredRevisionIds(revisions)
    if (expiredIds.length > 0) {
      await tx.itineraryRevision.deleteMany({
        where: { id: { in: expiredIds }, tripId },
      })
    }
    return {
      revisionCount: await tx.itineraryRevision.count({ where: { tripId } }),
      deletedRevisionCount: expiredIds.length,
    }
  }
  return timing
    ? timing.measure('itinerary_revision_retention_cleanup', cleanup)
    : cleanup()
}

async function nextRevisionNumber(
  tx: Prisma.TransactionClient,
  tripId: string
): Promise<number> {
  const latest = await tx.itineraryRevision.aggregate({
    where: { tripId },
    _max: { revisionNumber: true },
  })
  return (latest._max.revisionNumber ?? 0) + 1
}

async function insertRevision(
  tx: Prisma.TransactionClient,
  input: {
    tripId: string
    userId: string
    editVersion: number
    itinerary: Itinerary | object
    actionType: ItineraryRevisionAction
    actionSummary: string
  }
) {
  return tx.itineraryRevision.create({
    data: {
      tripId: input.tripId,
      revisionNumber: await nextRevisionNumber(tx, input.tripId),
      editVersion: input.editVersion,
      actionType: input.actionType,
      actionSummary: input.actionSummary.slice(0, 240),
      itineraryJson: input.itinerary as Prisma.InputJsonValue,
      createdByUserId: input.userId,
    },
  })
}

export async function persistItineraryMutation(
  input: PersistItineraryMutationInput
): Promise<PersistItineraryMutationResult> {
  const write = () =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; itineraryEditVersion: number }>>`
        SELECT "id", "itineraryEditVersion"
        FROM "trips"
        WHERE "id" = ${input.tripId} AND "userId" = ${input.userId}
        FOR UPDATE
      `
      const current = rows[0]
      if (!current || current.itineraryEditVersion !== input.expectedVersion) {
        return { updated: false, revisionCount: 0, deletedRevisionCount: 0 }
      }

      await insertRevision(tx, {
        tripId: input.tripId,
        userId: input.userId,
        editVersion: input.expectedVersion,
        itinerary: input.previousItinerary,
        actionType: input.actionType,
        actionSummary: input.actionSummary,
      })
      await tx.trip.update({
        where: { id: input.tripId },
        data: {
          itineraryJson: input.nextItinerary as unknown as Prisma.InputJsonValue,
          itineraryEditVersion: { increment: 1 },
        },
      })
      const retention = await cleanRevisionHistory(tx, input.tripId, input.timing)
      return { updated: true, ...retention }
    })

  const result = input.timing
    ? await input.timing.measure('itinerary_revision_create', write)
    : await write()
  input.timing?.setResultCount(result.revisionCount)
  return result
}

export async function persistGeneratedItinerary(
  tripId: string,
  status: TripStatus,
  itineraryJson: object,
  timing?: RequestTiming
): Promise<Trip> {
  const write = () =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string
          userId: string
          itineraryJson: Prisma.JsonValue | null
          itineraryEditVersion: number
        }>
      >`
        SELECT "id", "userId", "itineraryJson", "itineraryEditVersion"
        FROM "trips"
        WHERE "id" = ${tripId}
        FOR UPDATE
      `
      const current = rows[0]
      if (!current) throw new Error('Trip not found.')

      if (current.itineraryJson != null) {
        await insertRevision(tx, {
          tripId,
          userId: current.userId,
          editVersion: current.itineraryEditVersion,
          itinerary: current.itineraryJson as object,
          actionType: 'generate_itinerary',
          actionSummary: 'Regenerated the full itinerary',
        })
      }
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          status,
          itineraryJson: itineraryJson as Prisma.InputJsonValue,
          itineraryEditVersion: { increment: 1 },
        },
      })
      if (current.itineraryJson != null) {
        const retention = await cleanRevisionHistory(tx, tripId, timing)
        timing?.setResultCount(retention.revisionCount)
      }
      return updated
    })
  return timing ? timing.measure('itinerary_revision_create', write) : write()
}
