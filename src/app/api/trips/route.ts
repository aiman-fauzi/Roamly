import { NextResponse } from 'next/server'

import { requireApiUser } from '@/app/api/authRouteUtils'
import { createTrip, getUserTrips, ServiceError } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

function err(error: string, code: string, status: number) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status })
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    await ensureUser(auth.user.id, auth.user.email)
    const trips = await getUserTrips(auth.user.id)
    return NextResponse.json(trips)
  } catch {
    return err('Failed to fetch trips', 'INTERNAL_ERROR', 500)
  }
}

export async function POST() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    await ensureUser(auth.user.id, auth.user.email)
    const trip = await createTrip(auth.user.id)
    return NextResponse.json(trip, { status: 201 })
  } catch (e) {
    if (e instanceof ServiceError) {
      return err(e.message, e.code, 400)
    }
    return err('Failed to create trip', 'INTERNAL_ERROR', 500)
  }
}
