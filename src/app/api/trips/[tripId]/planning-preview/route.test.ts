import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

import { createClient } from '@/lib/supabase/server'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

const routeMocks = vi.hoisted(() => ({ getPlanningPreview: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/tripService', () => ({ getTripById: vi.fn() }))
vi.mock('@/services/userService', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/travel/persistence/tripTravelSelectionService', () => ({
  TripTravelSelectionService: vi.fn(() => routeMocks),
  TravelSelectionError: class TravelSelectionError extends Error {},
}))

const context = { params: Promise.resolve({ tripId: 'trip-1' }) }

describe('trip planning preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'owner@example.com' } },
          error: null,
        }),
      },
    } as never)
    vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-1', userId: 'user-1' } as never)
    routeMocks.getPlanningPreview.mockResolvedValue({
      planningPreview: { strictCandidateIds: true },
      eligibleCandidates: 10,
    })
  })

  it('loads lazy recommendations for the verified owner', async () => {
    const response = await GET(
      new Request('http://localhost/api/trips/trip-1/planning-preview'),
      context
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('server-timing')).toContain('authentication')
    expect(routeMocks.getPlanningPreview).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'trip-1', userId: 'user-1' })
    )
  })

  it('does not reveal another user trip', async () => {
    vi.mocked(getTripById).mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/trips/trip-1/planning-preview'),
      context
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toMatchObject({ code: 'NOT_FOUND', error: 'Trip not found' })
    expect(routeMocks.getPlanningPreview).not.toHaveBeenCalled()
  })
})
