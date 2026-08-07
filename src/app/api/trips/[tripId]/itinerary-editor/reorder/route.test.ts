import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PUT } from './route'

import { createClient } from '@/lib/supabase/server'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const editorMocks = vi.hoisted(() => ({ reorder: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/tripService', () => ({ getTripById: vi.fn() }))
vi.mock('@/services/userService', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/itinerary/itineraryEditorService', () => {
  class MockItineraryEditorError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown
    ) {
      super(message)
    }
  }
  return {
    ItineraryEditorError: MockItineraryEditorError,
    ItineraryEditorService: vi.fn(() => editorMocks),
  }
})

const context = { params: Promise.resolve({ tripId: 'trip-1' }) }
const validBody = {
  itemId: 'item-1',
  targetDayNumber: 2,
  targetPeriod: 'afternoon',
  targetIndex: 1,
  expectedVersion: 4,
}

describe('itinerary reorder route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
          error: null,
        }),
      },
    } as never)
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
    editorMocks.reorder.mockResolvedValue({ itineraryId: 'trip-1', version: 5 })
  })

  it('passes only validated coordinates and owner identity to the editor service', async () => {
    const response = await PUT(
      new Request('http://localhost/api/trips/trip-1/itinerary-editor/reorder', {
        method: 'PUT',
        body: JSON.stringify(validBody),
      }),
      context
    )

    expect(response.status).toBe(200)
    expect(editorMocks.reorder).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      validBody,
      expect.anything()
    )
  })

  it('rejects malformed mutation bodies before the service', async () => {
    const response = await PUT(
      new Request('http://localhost/api/trips/trip-1/itinerary-editor/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ...validBody, targetIndex: -1 }),
      }),
      context
    )

    expect(response.status).toBe(400)
    expect(editorMocks.reorder).not.toHaveBeenCalled()
  })

  it('does not reveal or mutate another user itinerary', async () => {
    vi.mocked(getTripById).mockResolvedValue(null)
    const response = await PUT(
      new Request('http://localhost/api/trips/trip-1/itinerary-editor/reorder', {
        method: 'PUT',
        body: JSON.stringify(validBody),
      }),
      context
    )

    expect(response.status).toBe(404)
    expect(editorMocks.reorder).not.toHaveBeenCalled()
  })
})
