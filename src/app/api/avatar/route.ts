import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { validateAvatarFile } from '@/lib/validations/avatarValidation'
import { ensureProfile, ServiceError, updateAvatar } from '@/services/profileService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return errorResponse('Unauthorised', 'UNAUTHORISED', 401)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse('Invalid form data', 'INVALID_BODY', 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return errorResponse('No file provided', 'MISSING_FILE', 400)
  }

  const validation = validateAvatarFile(file)
  if (!validation.valid) {
    return errorResponse(validation.error!, 'VALIDATION_ERROR', 400)
  }

  try {
    await ensureUser(session.user.id, session.user.email)
    await ensureProfile(session.user.id, null, null, session.user.email)
    const profile = await updateAvatar(session.user.id, file)
    return NextResponse.json({ avatarUrl: profile.avatarUrl })
  } catch (err) {
    if (err instanceof ServiceError) {
      return errorResponse(err.message, err.code, 400)
    }
    return errorResponse('Avatar upload failed', 'INTERNAL_ERROR', 500)
  }
}