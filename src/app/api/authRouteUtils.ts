import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { requireAuthenticatedUser, ServerAuthError } from '@/lib/auth/serverAuth'
import type { ApiErrorResponse } from '@/types/api'

type ApiUserResult = { user: User; response: null } | { user: null; response: NextResponse }

export async function requireApiUser(): Promise<ApiUserResult> {
  try {
    return { user: await requireAuthenticatedUser(), response: null }
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return {
        user: null,
        response: NextResponse.json<ApiErrorResponse>(
          {
            error: error.status === 401 ? 'Unauthorised' : 'Authentication service unavailable',
            code: error.status === 401 ? 'UNAUTHORISED' : 'AUTH_UNAVAILABLE',
          },
          { status: error.status }
        ),
      }
    }
    return {
      user: null,
      response: NextResponse.json<ApiErrorResponse>(
        { error: 'Authentication service unavailable', code: 'AUTH_UNAVAILABLE' },
        { status: 503 }
      ),
    }
  }
}
