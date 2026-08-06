import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ItineraryEditor } from '../ItineraryEditor'

import type { ItineraryEditorDocument, ItineraryItem } from '@/types/itinerary'

const A = 'ATTRACTION:11111111-1111-4111-8111-111111111111'
const B = 'ATTRACTION:22222222-2222-4222-8222-222222222222'

function item(candidateId: string, title: string, time: string): ItineraryItem {
  return {
    itemId: candidateId,
    candidateId,
    time,
    title,
    description: `${title} description`,
    location: 'Bangkok',
    latitude: 13.75,
    longitude: 100.5,
    transport: 'Walk',
    estimatedDuration: '60 min',
    durationMinutes: 60,
    reason: 'Good timing',
    estimatedCostLocal: 0,
    estimatedCostUserCurrency: 0,
    currencyLocal: 'THB',
    currencyUser: 'MYR',
    priceConfidence: 'PRICE_UNKNOWN',
    sourceEntityType: 'ATTRACTION',
    category: 'culture',
    area: 'Old Town',
    locked: false,
    source: 'generated',
    tips: [],
  }
}

function editorDocument(): ItineraryEditorDocument {
  return {
    itineraryId: 'trip-1',
    version: 2,
    dayDates: { 1: '2026-09-10' },
    dayNotices: {},
    mapPoints: [],
    itinerary: {
      title: 'Bangkok plan',
      summary: 'A compact city plan',
      currencyLocal: 'THB',
      currencyUser: 'MYR',
      exchangeRate: {
        baseCurrency: 'THB',
        quoteCurrency: 'MYR',
        rate: 0.13,
        source: 'test',
        fetchedAt: '2026-08-06T00:00:00.000Z',
        fromCache: false,
      },
      budget: {
        totalBudgetUserCurrency: 1_000,
        estimatedTotalLocal: 0,
        estimatedTotalUserCurrency: 0,
        remainingBudgetUserCurrency: 1_000,
        isBudgetExceeded: false,
      },
      days: [
        {
          dayNumber: 1,
          theme: 'Old Town',
          morning: [item(A, 'Grand Palace', '09:00'), item(B, 'Wat Pho', '10:30')],
          afternoon: [],
          evening: [],
          dailyTotalLocal: 0,
          dailyTotalUserCurrency: 0,
          notes: [],
        },
      ],
      roadmap: [],
    },
  }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ItineraryEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers keyboard-friendly move controls and sends an exact versioned reorder', async () => {
    const initial = editorDocument()
    const reordered = editorDocument()
    reordered.version = 3
    reordered.itinerary.days[0].morning.reverse()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(reordered))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ItineraryEditor tripId="trip-1" destination="Bangkok" />)

    await screen.findByRole('heading', { name: 'Grand Palace' })
    await user.click(screen.getByRole('button', { name: 'Move Grand Palace down' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const request = fetchMock.mock.calls[1]
    expect(request[0]).toContain('/itinerary-editor/reorder')
    expect(JSON.parse(request[1].body)).toEqual({
      itemId: A,
      targetDayNumber: 1,
      targetPeriod: 'morning',
      targetIndex: 2,
      expectedVersion: 2,
    })
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  })

  it('rolls back an optimistic lock and prompts reload on a version conflict', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(editorDocument()))
      .mockResolvedValueOnce(
        response(
          { error: 'This itinerary changed in another session.', code: 'ITINERARY_VERSION_CONFLICT' },
          409
        )
      )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ItineraryEditor tripId="trip-1" destination="Bangkok" />)

    await user.click(await screen.findByRole('button', { name: 'Lock Grand Palace' }))

    expect(await screen.findByText('This itinerary changed in another session.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock Grand Palace' })).toBeInTheDocument()
  })
})
