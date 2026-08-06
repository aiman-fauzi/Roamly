import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiUser } from '@/app/api/authRouteUtils'
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

async function ensureSessionProfile(user: {
  id: string
  email?: string
  user_metadata: Record<string, unknown>
}) {
  const metadata = user.user_metadata
  const displayName = metadataString(metadata, 'full_name') ?? metadataString(metadata, 'name')
  const avatarUrl = metadataString(metadata, 'avatar_url') ?? metadataString(metadata, 'picture')

  await ensureUser(user.id, user.email)
  return ensureProfile(user.id, displayName, avatarUrl, user.email)
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    if (!(await getProfile(auth.user.id))) await ensureSessionProfile(auth.user)
    const summary = await getProfileSummary(auth.user.id)
    return NextResponse.json(summary)
  } catch {
    return errorResponse('Failed to fetch profile', 'INTERNAL_ERROR', 500)
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

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
    await ensureSessionProfile(auth.user)
    await updateProfileDetails(auth.user.id, parsed.data)
    const summary = await getProfileSummary(auth.user.id)
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
