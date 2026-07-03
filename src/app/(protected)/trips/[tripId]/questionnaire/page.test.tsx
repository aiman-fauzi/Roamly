import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuestionnairePage from './page'

import { createClient } from '@/lib/supabase/server'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

vi.mock('@/components/features/questionnaire/QuestionnaireShell', () => ({
  QuestionnaireShell: ({ tripId }: { tripId: string }) => (
    <div data-testid="questionnaire-shell" data-trip-id={tripId} />
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/services/tripService', () => ({
  getTripById: vi.fn(),
}))

vi.mock('@/services/userService', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

describe('QuestionnairePage', () => {
  const getSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({ auth: { getSession } } as never)
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'owner-user-id',
            email: 'owner@example.com',
          },
        },
      },
    })
    vi.mocked(ensureUser).mockResolvedValue({ id: 'owner-user-id' } as never)
    vi.mocked(getTripById).mockResolvedValue({ id: 'trip-id' } as never)
  })

  it('verifies authenticated ownership before rendering the questionnaire shell', async () => {
    const result = (await QuestionnairePage({
      params: Promise.resolve({ tripId: 'trip-id' }),
    })) as ReactElement<{ tripId: string }>

    expect(ensureUser).toHaveBeenCalledWith('owner-user-id', 'owner@example.com')
    expect(getTripById).toHaveBeenCalledWith('trip-id', 'owner-user-id')
    expect(result.props.tripId).toBe('trip-id')
  })

  it('shows a recovery state when the trip is not owned by the session user', async () => {
    vi.mocked(getTripById).mockResolvedValue(null)

    const result = (await QuestionnairePage({
      params: Promise.resolve({ tripId: 'trip-id' }),
    })) as ReactElement

    expect(getTripById).toHaveBeenCalledWith('trip-id', 'owner-user-id')
    expect(typeof result.type).toBe('function')
    expect((result.type as { name?: string }).name).toBe('TripUnavailable')
  })

  it('redirects unauthenticated requests to login with next path', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    await expect(
      QuestionnairePage({ params: Promise.resolve({ tripId: 'trip-id' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/login?next=%2Ftrips%2Ftrip-id%2Fquestionnaire')
  })
})

