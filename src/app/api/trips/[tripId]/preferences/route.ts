import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { preferenceSetInputSchema } from '@/lib/validations/questionnaireValidation'
import { upsertPreferenceSet } from '@/services/preferenceService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

interface RouteContext {
  params: Promise<{ tripId: string }>
}

function err(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
}

export async function POST(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err('Invalid JSON body', 'INVALID_BODY', 400)
  }

  const parsed = preferenceSetInputSchema.safeParse(body)
  if (!parsed.success) {
    return err('Questionnaire answers are invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    await ensureUser(session.user.id, session.user.email)
    const trip = await getTripById(tripId, session.user.id)
    if (!trip) return err('Trip not found', 'NOT_FOUND', 404)

    const preferenceSet = await upsertPreferenceSet(tripId, parsed.data)
    return NextResponse.json(preferenceSet)
  } catch {
    return err('Failed to save preferences', 'INTERNAL_ERROR', 500)
  }
}