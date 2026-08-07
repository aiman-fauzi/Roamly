import { describe, expect, it } from 'vitest'

import {
  buildItineraryMapPoints,
  groupItineraryMapPointsByDay,
  validateItineraryMapPoints,
} from '../itineraryMapPoints'

import type { Itinerary, ItineraryItem, ItineraryMapPoint } from '@/types/itinerary'

const A = 'ATTRACTION:11111111-1111-4111-8111-111111111111'
const B = 'ATTRACTION:22222222-2222-4222-8222-222222222222'
const C = 'ATTRACTION:33333333-3333-4333-8333-333333333333'
const D = 'ATTRACTION:44444444-4444-4444-8444-444444444444'

function item(candidateId: string, title: string, latitude = 10, longitude = 104): ItineraryItem {
  return {
    itemId: `item-${candidateId.slice(-4)}`,
    candidateId,
    time: '09:00',
    title,
    description: title,
    location: 'Phu Quoc',
    latitude,
    longitude,
    transport: 'Walk',
    estimatedDuration: '60 min',
    durationMinutes: 60,
    reason: 'Test',
    estimatedCostLocal: 0,
    estimatedCostUserCurrency: 0,
    currencyLocal: 'VND',
    currencyUser: 'MYR',
    priceConfidence: 'PRICE_UNKNOWN',
    sourceEntityType: 'ATTRACTION',
    category: 'sight',
    tips: [],
  }
}

function itinerary(): Itinerary {
  return {
    title: 'Map plan',
    summary: 'Map plan',
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
    days: [
      {
        dayNumber: 1,
        theme: 'North',
        morning: [item(A, 'First')],
        afternoon: [item(B, 'Second')],
        evening: [],
        dailyTotalLocal: 0,
        dailyTotalUserCurrency: 0,
        notes: [],
      },
      {
        dayNumber: 2,
        theme: 'South',
        morning: [item(C, 'Third')],
        afternoon: [],
        evening: [],
        dailyTotalLocal: 0,
        dailyTotalUserCurrency: 0,
        notes: [],
      },
    ],
    roadmap: [],
  }
}

describe('itinerary map points', () => {
  it('builds globally ordered markers and groups routes by day', () => {
    const points = buildItineraryMapPoints(itinerary())

    expect(points.map(({ orderIndex }) => orderIndex)).toEqual([0, 1, 2])
    expect(groupItineraryMapPointsByDay(points).map((group) => ({
      dayNumber: group.dayNumber,
      titles: group.points.map(({ title }) => title),
    }))).toEqual([
      { dayNumber: 1, titles: ['First', 'Second'] },
      { dayNumber: 2, titles: ['Third'] },
    ])
  })

  it('reflects reorder, cross-day move, and replacement in map output', () => {
    const document = itinerary()
    const moved = document.days[0].afternoon.splice(0, 1)[0]
    document.days[1].morning.unshift(moved)
    document.days[0].morning[0] = item(D, 'Replacement')

    const points = buildItineraryMapPoints(document)
    const groups = groupItineraryMapPointsByDay(points)

    expect(points[0]).toMatchObject({ candidateId: D, title: 'Replacement' })
    expect(groups[1].points.map(({ title }) => title)).toEqual(['Second', 'Third'])
  })

  it('skips invalid coordinates, unsupported IDs, and duplicate item IDs safely', () => {
    const valid: ItineraryMapPoint = {
      itemId: 'item-1',
      candidateId: A,
      dayNumber: 1,
      orderIndex: 0,
      title: 'Valid',
      latitude: 10,
      longitude: 104,
      category: 'sight',
      areaGroup: null,
    }
    const result = validateItineraryMapPoints([
      valid,
      { ...valid, itemId: 'item-2', latitude: 120 },
      { ...valid, itemId: 'item-3', candidateId: 'invented' },
      { ...valid, title: 'Duplicate' },
    ])

    expect(result.validPoints).toEqual([valid])
    expect(result.skippedPointCount).toBe(3)
    expect(result.skippedByReason).toEqual({
      invalid_coordinate: 1,
      invalid_candidate_id: 1,
      duplicate_item_id: 1,
    })
  })
})
