import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { ExchangeRateError } from '@/services/exchangeRateService'
import type { TravelOfferResultStatus } from '@/services/travel/offers/types'
import { TripOfferSelectionError } from '@/services/travel/persistence/tripOfferSelectionService'
import { TravelPlanningError } from '@/services/travel/planning/tripTravelPlanningService'
import { TripTravelProfileError } from '@/services/travel/profile/tripTravelProfileService'
import { TripTravelSearchRequestError } from '@/services/travel/profile/tripTravelSearchRequestService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'
import type { TripWithPreferences } from '@/types/trip'

export interface RouteContext {
  params: Promise<{ tripId: string }>
}

export interface AuthenticatedTrip {
  trip: TripWithPreferences
  userId: string
}

export function err(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
}

export async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() }
  } catch {
    return { response: err('Invalid JSON body', 'INVALID_BODY', 400) }
  }
}

export async function requireAuthenticatedTrip(tripId: string): Promise<AuthenticatedTrip | { response: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { response: err('Unauthorised', 'UNAUTHORISED', 401) }

  try {
    await ensureUser(session.user.id, session.user.email)
    const trip = await getTripById(tripId, session.user.id)
    if (!trip) return { response: err('Trip not found', 'NOT_FOUND', 404) }
    return { trip, userId: session.user.id }
  } catch {
    return { response: err('Failed to authenticate trip', 'INTERNAL_ERROR', 500) }
  }
}

export function offerStatusCode(status: TravelOfferResultStatus): number {
  if (status === 'RATE_LIMITED') return 429
  if (status === 'TEMPORARY_FAILURE' || status === 'PROVIDER_UNAVAILABLE') return 503
  if (status === 'INVALID_REQUEST') return 400
  return 200
}

export function routeErrorResponse(error: unknown) {
  if (error instanceof ExchangeRateError) {
    return err(error.message, 'EXCHANGE_RATE_UNAVAILABLE', 400)
  }
  if (error instanceof TravelPlanningError) {
    return err(error.message, error.code, error.status, error.details)
  }
  if (error instanceof TripTravelProfileError) {
    return err(error.message, error.code, error.status, error.details)
  }
  if (error instanceof TripOfferSelectionError) {
    return err(error.message, error.code, error.status, error.details)
  }
  if (error instanceof TripTravelSearchRequestError) {
    return err(error.message, error.code, error.status, error.details)
  }

  const message = error instanceof Error ? error.message : 'Unknown travel planning error'
  return err('Failed to plan trip travel', 'TRAVEL_PLANNING_FAILED', 500, { reason: message })
}
