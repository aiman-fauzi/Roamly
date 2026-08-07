import { describe, expect, it, vi } from 'vitest'

import { ItineraryRevisionService } from '../itineraryRevisionService'

import type {
  Itinerary,
  ItineraryEditorDocument,
  ItineraryItem,
} from '@/types/itinerary'

const A = 'ATTRACTION:11111111-1111-4111-8111-111111111111'
const B = 'ATTRACTION:22222222-2222-4222-8222-222222222222'

function item(candidateId: string, title: string): ItineraryItem {
  return {
    itemId: `item-${candidateId.slice(-4)}`,
    candidateId,
    time: '09:00',
    title,
    description: `${title} description`,
    location: 'Phu Quoc',
    latitude: 10.2,
    longitude: 103.9,
    transport: 'Walk',
    estimatedDuration: '60 min',
    durationMinutes: 60,
    reason: 'Good fit',
    estimatedCostLocal: 0,
    estimatedCostUserCurrency: 0,
    currencyLocal: 'VND',
    currencyUser: 'MYR',
    priceConfidence: 'PRICE_UNKNOWN',
    sourceEntityType: 'ATTRACTION',
    category: 'beach',
    locked: false,
    editorNotes: '',
    source: 'generated',
    tips: [],
  }
}

function itinerary(title = 'Current itinerary'): Itinerary {
  return {
    title,
    summary: 'One day',
    currencyLocal: 'VND',
    currencyUser: 'MYR',
    exchangeRate: {
      baseCurrency: 'VND',
      quoteCurrency: 'MYR',
      rate: 0.00016,
      source: 'test',
      fetchedAt: '2026-08-07T00:00:00.000Z',
      fromCache: false,
    },
    budget: {
      totalBudgetUserCurrency: 1000,
      estimatedTotalLocal: 0,
      estimatedTotalUserCurrency: 0,
      remainingBudgetUserCurrency: 1000,
      isBudgetExceeded: false,
    },
    days: [
      {
        dayNumber: 1,
        theme: 'Island day',
        morning: [item(A, 'Khem Beach')],
        afternoon: [item(B, 'Dinh Cau Temple')],
        evening: [],
        dailyTotalLocal: 0,
        dailyTotalUserCurrency: 0,
        notes: [],
      },
    ],
    roadmap: [],
  }
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1',
    tripId: 'trip-1',
    revisionNumber: 1,
    editVersion: 1,
    actionType: 'move_item',
    actionSummary: 'Moved Khem Beach from Day 1 to Day 2',
    itineraryJson: itinerary('Historical itinerary'),
    createdAt: new Date('2026-08-07T01:00:00.000Z'),
    ...overrides,
  }
}

function editorDocument(version = 3): ItineraryEditorDocument {
  return {
    itineraryId: 'trip-1',
    version,
    itinerary: itinerary('Restored itinerary'),
    mapPoints: [],
    dayDates: {},
    dayNotices: {},
  }
}

function dependencies() {
  return {
    loadTrip: vi.fn().mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
      itineraryJson: itinerary(),
      itineraryEditVersion: 2,
    }),
    listRevisions: vi.fn().mockResolvedValue([revision()]),
    loadRevision: vi.fn().mockResolvedValue(revision()),
    findActiveCandidateIds: vi.fn().mockImplementation(async (ids: string[]) => new Set(ids)),
    persistMutation: vi.fn().mockResolvedValue({
      updated: true,
      revisionCount: 2,
      deletedRevisionCount: 0,
    }),
    loadEditorDocument: vi.fn().mockResolvedValue(editorDocument()),
  }
}

describe('ItineraryRevisionService', () => {
  it('lists metadata without exposing itinerary JSON', async () => {
    const deps = dependencies()
    const service = new ItineraryRevisionService(deps)

    const result = await service.list('trip-1', 'user-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ actionType: 'move_item', isRestorable: true })
    expect(result[0]).not.toHaveProperty('itineraryJson')
  })

  it('returns a safe preview with ordered items and supported map points', async () => {
    const service = new ItineraryRevisionService(dependencies())

    const result = await service.preview('trip-1', 'user-1', 'revision-1')

    expect(result).toMatchObject({ dayCount: 1, itemCount: 2, lockedItemCount: 0 })
    expect(result.days[0].items.map(({ title }) => title)).toEqual([
      'Khem Beach',
      'Dinh Cau Temple',
    ])
    expect(result.days[0].items[0]).not.toHaveProperty('candidateId')
    expect(result.mapPoints).toHaveLength(2)
  })

  it('restores a revision while snapshotting the current state', async () => {
    const deps = dependencies()
    const service = new ItineraryRevisionService(deps)

    const result = await service.restore('trip-1', 'user-1', 'revision-1', 2)

    expect(result.version).toBe(3)
    expect(deps.persistMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        actionType: 'restore_revision',
        actionSummary: expect.stringContaining('Restored revision 1'),
      })
    )
    const write = deps.persistMutation.mock.calls[0][0]
    expect(write.previousItinerary.title).toBe('Current itinerary')
    expect(write.nextItinerary.title).toBe('Historical itinerary')
  })

  it('undo restores the latest pre-mutation state and creates a restore transition', async () => {
    const deps = dependencies()
    const service = new ItineraryRevisionService(deps)

    const result = await service.undo('trip-1', 'user-1', 2)

    expect(result.state).toBe('restored')
    expect(deps.persistMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'restore_revision',
        actionSummary: expect.stringContaining('Undid Moved Khem Beach'),
      })
    )
  })

  it('returns a clear no-op when there is no revision to undo', async () => {
    const deps = dependencies()
    deps.listRevisions.mockResolvedValue([])
    const service = new ItineraryRevisionService(deps)

    const result = await service.undo('trip-1', 'user-1', 2)

    expect(result.state).toBe('empty')
    expect(deps.persistMutation).not.toHaveBeenCalled()
  })

  it('rejects stale restore before creating a revision', async () => {
    const deps = dependencies()
    const service = new ItineraryRevisionService(deps)

    await expect(
      service.restore('trip-1', 'user-1', 'revision-1', 1)
    ).rejects.toMatchObject({ code: 'ITINERARY_VERSION_CONFLICT', status: 409 })
    expect(deps.persistMutation).not.toHaveBeenCalled()
  })

  it('returns 404 for a revision requested by another owner', async () => {
    const deps = dependencies()
    deps.loadTrip.mockResolvedValue(null)
    const service = new ItineraryRevisionService(deps)

    await expect(service.list('trip-1', 'other-user')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
      status: 404,
    })
    expect(deps.listRevisions).not.toHaveBeenCalled()
  })

  it('allows only one of two concurrent restores at the same edit version', async () => {
    const deps = dependencies()
    let writes = 0
    deps.persistMutation.mockImplementation(async () => ({
      updated: writes++ === 0,
      revisionCount: 2,
      deletedRevisionCount: 0,
    }))
    const service = new ItineraryRevisionService(deps)

    const results = await Promise.allSettled([
      service.restore('trip-1', 'user-1', 'revision-1', 2),
      service.restore('trip-1', 'user-1', 'revision-1', 2),
    ])

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'ITINERARY_VERSION_CONFLICT', status: 409 },
    })
  })
})
