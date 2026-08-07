import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ItineraryEditor } from '../ItineraryEditor'

import type { ItineraryEditorDocument, ItineraryItem } from '@/types/itinerary'

const editorHarness = vi.hoisted(() => ({ map: vi.fn() }))

vi.mock('../ItineraryMap', () => ({
  ItineraryMap: (props: unknown) => {
    editorHarness.map(props)
    return <div data-testid="itinerary-map">Map</div>
  },
}))

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
    editorHarness.map.mockClear()
  })

  it('offers keyboard-friendly move controls and sends an exact versioned reorder', async () => {
    const initial = editorDocument()
    const reordered = editorDocument()
    reordered.version = 3
    reordered.itinerary.days[0].morning.reverse()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response({ revisions: [] }))
      .mockResolvedValueOnce(response(reordered))
      .mockResolvedValueOnce(response({ revisions: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ItineraryEditor tripId="trip-1" destination="Bangkok" />)

    await screen.findByRole('heading', { name: 'Grand Palace' })
    await user.click(screen.getByRole('button', { name: 'Move Grand Palace down' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    const request = fetchMock.mock.calls[2]
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
      .mockResolvedValueOnce(response({ revisions: [] }))
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

  it('undoes the latest change with the current edit version', async () => {
    const restored = editorDocument()
    restored.version = 3
    const revision = {
      id: 'revision-1',
      revisionNumber: 1,
      actionType: 'lock_item',
      actionSummary: 'Locked Grand Palace',
      editVersion: 1,
      createdAt: '2026-08-07T01:00:00.000Z',
      isRestorable: true,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(editorDocument()))
      .mockResolvedValueOnce(response({ revisions: [revision] }))
      .mockResolvedValueOnce(response({ state: 'restored', document: restored }))
      .mockResolvedValueOnce(response({ revisions: [revision] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ItineraryEditor tripId="trip-1" destination="Bangkok" />)

    await user.click(await screen.findByRole('button', { name: 'Undo last change' }))

    await screen.findByText('Last change undone')
    const request = fetchMock.mock.calls[2]
    expect(request[0]).toContain('/itinerary-editor/undo')
    expect(JSON.parse(request[1].body)).toEqual({ expectedVersion: 2 })
  })

  it('refreshes map points after an explicitly confirmed revision restore', async () => {
    const initial = editorDocument()
    initial.mapPoints = [{
      itemId: A,
      candidateId: A,
      dayNumber: 1,
      orderIndex: 0,
      title: 'Grand Palace',
      latitude: 13.75,
      longitude: 100.5,
      category: 'culture',
      areaGroup: null,
    }]
    const restored = editorDocument()
    restored.version = 3
    restored.mapPoints = [{
      itemId: B,
      candidateId: B,
      dayNumber: 1,
      orderIndex: 0,
      title: 'Wat Pho',
      latitude: 13.751,
      longitude: 100.501,
      category: 'culture',
      areaGroup: null,
    }]
    const revision = {
      id: 'revision-1',
      revisionNumber: 1,
      actionType: 'replace_item',
      actionSummary: 'Replaced Wat Pho with Grand Palace',
      editVersion: 1,
      createdAt: '2026-08-07T01:00:00.000Z',
      isRestorable: true,
    }
    const preview = {
      ...revision,
      dayCount: 1,
      itemCount: 2,
      lockedItemCount: 0,
      days: [{
        dayNumber: 1,
        theme: 'Old Town',
        items: [{ itemId: A, title: 'Grand Palace', category: 'culture', orderIndex: 0, locked: false, notes: null }],
      }],
      mapPoints: initial.mapPoints,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response({ revisions: [revision] }))
      .mockResolvedValueOnce(response({ revisions: [revision] }))
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(response(restored))
      .mockResolvedValueOnce(response({ revisions: [revision] }))
      .mockResolvedValueOnce(response(preview))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<ItineraryEditor tripId="trip-1" destination="Bangkok" />)

    await user.click(await screen.findByRole('button', { name: 'History' }))
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    expect(screen.getByText(/Restoring this version will replace/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore revision' }))

    await screen.findByText('Revision restored')
    await waitFor(() => {
      const latestProps = editorHarness.map.mock.calls.at(-1)?.[0] as {
        points: ItineraryEditorDocument['mapPoints']
      }
      expect(latestProps.points[0].itemId).toBe(B)
    })
  })
})
