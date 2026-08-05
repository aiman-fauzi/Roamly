import { describe, expect, it, vi } from 'vitest'

import type { TripBudgetSummary } from '@/services/travel/budget/types'
import { TripBudgetSnapshotService } from '@/services/travel/persistence/tripBudgetSnapshotService'

const summary: TripBudgetSummary = {
  currency: 'MYR',
  flight: {
    status: 'KNOWN',
    amount: { amount: '840.00', currency: 'MYR' },
    perPersonAmount: { amount: '420.00', currency: 'MYR' },
    assumptions: [],
    missingData: [],
  },
  accommodation: {
    status: 'KNOWN',
    amount: { amount: '520.00', currency: 'MYR' },
    perPersonAmount: { amount: '260.00', currency: 'MYR' },
    assumptions: [],
    missingData: [],
  },
  attractions: {
    status: 'PARTIAL',
    amount: { amount: '20.00', currency: 'MYR' },
    perPersonAmount: { amount: '10.00', currency: 'MYR' },
    assumptions: ['Verified ticket prices only.'],
    missingData: ['Unknown verified ticket price for Mystery Museum.'],
  },
  food: {
    status: 'ESTIMATED',
    amount: { amount: '320.00', currency: 'MYR' },
    perPersonAmount: { amount: '160.00', currency: 'MYR' },
    assumptions: ['Daily allowance.'],
    missingData: [],
  },
  localTransport: {
    status: 'ESTIMATED',
    amount: { amount: '120.00', currency: 'MYR' },
    perPersonAmount: { amount: '60.00', currency: 'MYR' },
    assumptions: ['Daily transport allowance.'],
    missingData: [],
  },
  contingency: {
    status: 'ESTIMATED',
    amount: { amount: '182.00', currency: 'MYR' },
    perPersonAmount: { amount: '91.00', currency: 'MYR' },
    assumptions: ['10% contingency.'],
    missingData: [],
  },
  total: {
    amount: { amount: '2002.00', currency: 'MYR' },
    perPersonAmount: { amount: '1001.00', currency: 'MYR' },
  },
  assumptions: ['Daily allowance.', '10% contingency.'],
  missingData: ['Unknown verified ticket price for Mystery Museum.'],
  calculatedAt: '2026-08-05T00:00:00.000Z',
}

describe('TripBudgetSnapshotService', () => {
  it('supersedes the previous current snapshot and stores a current budget snapshot', async () => {
    const tx = {
      tripBudgetSnapshot: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'budget-snapshot-1',
            tripId: data.tripId,
            ...data,
            createdAt: new Date('2026-08-05T00:00:00.000Z'),
            updatedAt: new Date('2026-08-05T00:00:00.000Z'),
          })
        ),
      },
    }
    const db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      tripBudgetSnapshot: { findFirst: vi.fn() },
    }
    const service = new TripBudgetSnapshotService({ db: db as never })

    const snapshot = await service.createCurrent({
      tripId: 'trip-1',
      budgetSummary: summary,
      selectedFlightSnapshotId: 'flight-selection-1',
      selectedHotelSnapshotId: 'hotel-selection-1',
    })

    expect(tx.tripBudgetSnapshot.updateMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', status: 'CURRENT' },
      data: { status: 'SUPERSEDED' },
    })
    expect(tx.tripBudgetSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: 'trip-1',
        totalAmount: expect.objectContaining({ toString: expect.any(Function) }),
        perPersonAmount: expect.objectContaining({ toString: expect.any(Function) }),
        selectedFlightSnapshotId: 'flight-selection-1',
        selectedHotelSnapshotId: 'hotel-selection-1',
      }),
    })
    expect(snapshot).toMatchObject({
      id: 'budget-snapshot-1',
      currency: 'MYR',
      attractions: expect.objectContaining({
        status: 'PARTIAL',
        missingData: ['Unknown verified ticket price for Mystery Museum.'],
      }),
      totalAmount: { amount: '2002.00', currency: 'MYR' },
      perPersonAmount: { amount: '1001.00', currency: 'MYR' },
      selectedFlightSnapshotId: 'flight-selection-1',
      selectedHotelSnapshotId: 'hotel-selection-1',
      status: 'CURRENT',
    })
  })
})
