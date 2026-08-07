import { TripStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  expiredRevisionIds,
  ITINERARY_REVISION_LIMIT,
  persistGeneratedItinerary,
  persistItineraryMutation,
} from '../itineraryRevisionPersistence'

import type { Itinerary } from '@/types/itinerary'

const database = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    itineraryRevision: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    trip: { update: vi.fn() },
  }
  return {
    tx,
    transaction: vi.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  }
})

vi.mock('@/db/client', () => ({
  prisma: { $transaction: database.transaction },
}))

function itinerary(title: string): Itinerary {
  return {
    title,
    summary: title,
    currencyLocal: 'VND',
    currencyUser: 'MYR',
    exchangeRate: {
      baseCurrency: 'VND',
      quoteCurrency: 'MYR',
      rate: 1,
      source: 'test',
      fetchedAt: '2026-08-07T00:00:00.000Z',
      fromCache: false,
    },
    budget: {
      totalBudgetUserCurrency: 0,
      estimatedTotalLocal: 0,
      estimatedTotalUserCurrency: 0,
      remainingBudgetUserCurrency: 0,
      isBudgetExceeded: false,
    },
    days: [],
    roadmap: [],
  }
}

describe('itinerary revision retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.tx.$queryRaw.mockResolvedValue([
      { id: 'trip-1', userId: 'user-1', itineraryEditVersion: 2 },
    ])
    database.tx.itineraryRevision.aggregate.mockResolvedValue({
      _max: { revisionNumber: 20 },
    })
    database.tx.itineraryRevision.create.mockResolvedValue({ id: 'revision-21' })
    database.tx.itineraryRevision.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `revision-${21 - index}`,
        revisionNumber: 21 - index,
      }))
    )
    database.tx.itineraryRevision.deleteMany.mockResolvedValue({ count: 1 })
    database.tx.itineraryRevision.count.mockResolvedValue(20)
    database.tx.trip.update.mockResolvedValue({ id: 'trip-1' })
  })

  it('keeps the newest 20 revisions and expires only older rows', () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      id: `revision-${index + 1}`,
      revisionNumber: index + 1,
    }))

    expect(ITINERARY_REVISION_LIMIT).toBe(20)
    expect(expiredRevisionIds(rows)).toEqual([
      'revision-4',
      'revision-3',
      'revision-2',
      'revision-1',
    ])
  })

  it('inserts the pre-mutation revision before updating and cleans retention atomically', async () => {
    const result = await persistItineraryMutation({
      tripId: 'trip-1',
      userId: 'user-1',
      expectedVersion: 2,
      previousItinerary: itinerary('Before'),
      nextItinerary: itinerary('After'),
      actionType: 'update_notes',
      actionSummary: 'Updated notes for Khem Beach',
    })

    expect(result).toEqual({ updated: true, revisionCount: 20, deletedRevisionCount: 1 })
    expect(database.tx.itineraryRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionNumber: 21,
        editVersion: 2,
        actionType: 'update_notes',
        itineraryJson: expect.objectContaining({ title: 'Before' }),
      }),
    })
    expect(database.tx.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: {
        itineraryJson: expect.objectContaining({ title: 'After' }),
        itineraryEditVersion: { increment: 1 },
      },
    })
    expect(database.tx.itineraryRevision.create.mock.invocationCallOrder[0]).toBeLessThan(
      database.tx.trip.update.mock.invocationCallOrder[0]
    )
    expect(database.tx.itineraryRevision.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['revision-1'] }, tripId: 'trip-1' },
    })
  })

  it('creates no revision when the compare-and-swap version is stale', async () => {
    database.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'trip-1', itineraryEditVersion: 3 },
    ])

    const result = await persistItineraryMutation({
      tripId: 'trip-1',
      userId: 'user-1',
      expectedVersion: 2,
      previousItinerary: itinerary('Before'),
      nextItinerary: itinerary('After'),
      actionType: 'lock_item',
      actionSummary: 'Locked Khem Beach',
    })

    expect(result.updated).toBe(false)
    expect(database.tx.itineraryRevision.create).not.toHaveBeenCalled()
    expect(database.tx.trip.update).not.toHaveBeenCalled()
  })

  it('does not update the itinerary when revision insertion fails', async () => {
    database.tx.itineraryRevision.create.mockRejectedValueOnce(new Error('revision write failed'))

    await expect(persistItineraryMutation({
      tripId: 'trip-1',
      userId: 'user-1',
      expectedVersion: 2,
      previousItinerary: itinerary('Before'),
      nextItinerary: itinerary('After'),
      actionType: 'replace_item',
      actionSummary: 'Replaced A with B',
    })).rejects.toThrow('revision write failed')
    expect(database.tx.trip.update).not.toHaveBeenCalled()
  })

  it('snapshots an existing itinerary before a full itinerary replacement', async () => {
    database.tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'trip-1',
        userId: 'user-1',
        itineraryJson: itinerary('Existing'),
        itineraryEditVersion: 2,
      },
    ])
    database.tx.trip.update.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.COMPLETE })

    await persistGeneratedItinerary(
      'trip-1',
      TripStatus.COMPLETE,
      itinerary('Generated replacement')
    )

    expect(database.tx.itineraryRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'generate_itinerary',
        actionSummary: 'Regenerated the full itinerary',
        itineraryJson: expect.objectContaining({ title: 'Existing' }),
      }),
    })
    expect(database.tx.trip.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        itineraryJson: expect.objectContaining({ title: 'Generated replacement' }),
      }),
    }))
  })
})
