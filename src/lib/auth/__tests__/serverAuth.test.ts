import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getOptionalAuthenticatedUser, requireAuthenticatedUser } from '@/lib/auth/serverAuth'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

function getUserResult(input: { user?: object | null; error?: object | null }) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: input.user ?? null },
        error: input.error ?? null,
      }),
    },
  } as never)
}

describe('verified server auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a user verified by Supabase', async () => {
    getUserResult({ user: { id: 'user-1', email: 'owner@example.com' } })

    await expect(requireAuthenticatedUser()).resolves.toMatchObject({ id: 'user-1' })
  })

  it.each([
    ['missing cookie', { name: 'AuthSessionMissingError', status: 400 }],
    ['expired token', { name: 'AuthApiError', status: 401, message: 'JWT expired' }],
    ['invalid token', { name: 'AuthApiError', status: 403, message: 'Invalid JWT' }],
  ])('normalizes a %s as unauthenticated', async (_case, error) => {
    getUserResult({ error })

    await expect(getOptionalAuthenticatedUser()).resolves.toBeNull()
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
      message: 'Authentication is required.',
    })
  })

  it('normalizes provider failures without leaking raw errors', async () => {
    getUserResult({
      error: { name: 'AuthUnknownError', status: 500, message: 'private provider diagnostic' },
    })

    const error = await requireAuthenticatedUser().catch((caught) => caught)
    expect(error).toMatchObject({
      code: 'AUTH_PROVIDER_UNAVAILABLE',
      status: 503,
      message: 'Authentication could not be verified.',
    })
    expect(JSON.stringify(error)).not.toContain('private provider diagnostic')
  })

  it('normalizes a thrown auth network failure', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error('socket details')) },
    } as never)

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_UNAVAILABLE',
      status: 503,
    })
  })
})
