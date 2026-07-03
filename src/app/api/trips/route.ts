import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createTrip, getUserTrips, ServiceError } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

function err(error: string, code: string, status: number) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  try {
    await ensureUser(session.user.id, session.user.email)
    const trips = await getUserTrips(session.user.id)
    return NextResponse.json(trips)
  } catch {
    return err('Failed to fetch trips', 'INTERNAL_ERROR', 500)
  }
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  try {
    await ensureUser(session.user.id, session.user.email)
    const trip = await createTrip(session.user.id)
    return NextResponse.json(trip, { status: 201 })
  } catch (e) {
    if (e instanceof ServiceError) {
      return err(e.message, e.code, 400)
    }
    return err('Failed to create trip', 'INTERNAL_ERROR', 500)
  }
}