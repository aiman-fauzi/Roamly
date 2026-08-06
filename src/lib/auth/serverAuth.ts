import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

export type ServerAuthErrorCode = 'UNAUTHENTICATED' | 'AUTH_PROVIDER_UNAVAILABLE'

export class ServerAuthError extends Error {
  constructor(
    public readonly code: ServerAuthErrorCode,
    public readonly status: 401 | 503
  ) {
    super(
      code === 'UNAUTHENTICATED'
        ? 'Authentication is required.'
        : 'Authentication could not be verified.'
    )
    this.name = 'ServerAuthError'
  }
}

function isCredentialFailure(error: { status?: number; name?: string; code?: string }): boolean {
  return (
    error.status === 400 ||
    error.status === 401 ||
    error.status === 403 ||
    error.name === 'AuthSessionMissingError' ||
    error.code === 'session_not_found' ||
    error.code === 'refresh_token_not_found'
  )
}

async function readVerifiedUser(): Promise<User | null> {
  const supabase = await createClient()
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>

  try {
    result = await supabase.auth.getUser()
  } catch {
    throw new ServerAuthError('AUTH_PROVIDER_UNAVAILABLE', 503)
  }

  if (result.error) {
    if (isCredentialFailure(result.error)) return null
    throw new ServerAuthError('AUTH_PROVIDER_UNAVAILABLE', 503)
  }

  return result.data.user ?? null
}

export async function getOptionalAuthenticatedUser(): Promise<User | null> {
  return readVerifiedUser()
}

export async function requireAuthenticatedUser(): Promise<User> {
  const user = await readVerifiedUser()
  if (!user) throw new ServerAuthError('UNAUTHENTICATED', 401)
  return user
}
