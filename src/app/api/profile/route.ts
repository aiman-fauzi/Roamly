import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { profileUpdateSchema } from '@/lib/validations/profileValidation'
import {
  ensureProfile,
  getProfile,
  getProfileSummary,
  ServiceError,
  updateProfileDetails,
} from '@/services/profileService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

async function ensureSessionProfile(session: {
  user: { id: string; email?: string; user_metadata: Record<string, unknown> }
}) {
  const metadata = session.user.user_metadata
  const displayName = metadataString(metadata, 'full_name') ?? metadataString(metadata, 'name')
  const avatarUrl = metadataString(metadata, 'avatar_url') ?? metadataString(metadata, 'picture')

  await ensureUser(session.user.id, session.user.email)
  return ensureProfile(session.user.id, displayName, avatarUrl, session.user.email)
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return errorResponse('Unauthorised', 'UNAUTHORISED', 401)

  try {
    if (!(await getProfile(session.user.id))) await ensureSessionProfile(session)
    const summary = await getProfileSummary(session.user.id)
    return NextResponse.json(summary)
  } catch {
    return errorResponse('Failed to fetch profile', 'INTERNAL_ERROR', 500)
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return errorResponse('Unauthorised', 'UNAUTHORISED', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400)
  }

  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(
      'Profile fields are invalid.',
      'VALIDATION_ERROR',
      400,
      parsed.error.flatten()
    )
  }

  try {
    await ensureSessionProfile(session)
    await updateProfileDetails(session.user.id, parsed.data)
    const summary = await getProfileSummary(session.user.id)
    return NextResponse.json(summary)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse('Profile fields are invalid.', 'VALIDATION_ERROR', 400, err.flatten())
    }
    if (err instanceof ServiceError) {
      return errorResponse(err.message, err.code, 400)
    }
    return errorResponse('Failed to update profile', 'INTERNAL_ERROR', 500)
  }
}