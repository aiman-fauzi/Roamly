import { NextResponse } from 'next/server'

import { requireApiUser } from '@/app/api/authRouteUtils'
import { deleteTrip, getTripById, ServiceError } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

interface RouteContext {
  params: Promise<{ tripId: string }>
}

function err(error: string, code: string, status: number) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status })
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    await ensureUser(auth.user.id, auth.user.email)
    const trip = await getTripById(tripId, auth.user.id)
    if (!trip) return err('Trip not found', 'NOT_FOUND', 404)
    return NextResponse.json(trip)
  } catch {
    return err('Failed to fetch trip', 'INTERNAL_ERROR', 500)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    await ensureUser(auth.user.id, auth.user.email)
    await deleteTrip(tripId, auth.user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ServiceError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400
      return err(error.message, error.code, status)
    }
    return err('Failed to delete trip', 'INTERNAL_ERROR', 500)
  }
}
