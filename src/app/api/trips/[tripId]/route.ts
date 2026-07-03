import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  try {
    await ensureUser(session.user.id, session.user.email)
    const trip = await getTripById(tripId, session.user.id)
    if (!trip) return err('Trip not found', 'NOT_FOUND', 404)
    return NextResponse.json(trip)
  } catch {
    return err('Failed to fetch trip', 'INTERNAL_ERROR', 500)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  try {
    await ensureUser(session.user.id, session.user.email)
    await deleteTrip(tripId, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ServiceError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400
      return err(error.message, error.code, status)
    }
    return err('Failed to delete trip', 'INTERNAL_ERROR', 500)
  }
}