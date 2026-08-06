import { NextResponse } from 'next/server'

import { requireAuthenticatedUser, ServerAuthError } from '@/lib/auth/serverAuth'
import type { RequestTiming } from '@/lib/observability/requestTiming'
import { ExchangeRateError } from '@/services/exchangeRateService'
import type { TravelOfferResultStatus } from '@/services/travel/offers/types'
import { TripOfferSelectionError } from '@/services/travel/persistence/tripOfferSelectionService'
import { TravelSelectionError } from '@/services/travel/persistence/tripTravelSelectionService'
import { TravelPlanningError } from '@/services/travel/planning/tripTravelPlanningService'
import { TripTravelProfileError } from '@/services/travel/profile/tripTravelProfileService'
import { TripTravelSearchRequestError } from '@/services/travel/profile/tripTravelSearchRequestService'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'
import type { TripWithTravelProfile } from '@/types/trip'

export interface RouteContext {
  params: Promise<{ tripId: string }>
}

export interface AuthenticatedTrip {
  trip: TripWithTravelProfile
  userId: string
}

export function err(error: string, code: string, status: number, details?: unknown) {
  const response = NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
  response.headers.set('X-Roamly-Error-Code', code)
  return response
}

export async function readJsonBody(
  request: Request
): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() }
  } catch {
    return { response: err('Invalid JSON body', 'INVALID_BODY', 400) }
  }
}

export async function requireAuthenticatedTrip(
  tripId: string,
  timing?: RequestTiming
): Promise<AuthenticatedTrip | { response: NextResponse }> {
  try {
    const authenticate = () => requireAuthenticatedUser()
    const user = timing
      ? await timing.measure('authentication', authenticate)
      : await authenticate()
    const syncUser = () => ensureUser(user.id, user.email)
    const findTrip = () => getTripById(tripId, user.id)
    const [, trip] = await Promise.all([
      timing ? timing.measure('user_sync', syncUser) : syncUser(),
      timing ? timing.measure('trip_ownership_lookup', findTrip) : findTrip(),
    ])
    if (!trip) return { response: err('Trip not found', 'NOT_FOUND', 404) }
    return { trip, userId: user.id }
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return {
        response: err(
          error.status === 401 ? 'Unauthorised' : 'Authentication service unavailable',
          error.status === 401 ? 'UNAUTHORISED' : 'AUTH_UNAVAILABLE',
          error.status
        ),
      }
    }
    return { response: err('Failed to authenticate trip', 'INTERNAL_ERROR', 500) }
  }
}

export function completeTimedResponse(
  response: NextResponse,
  timing: RequestTiming,
  outcome: 'success' | 'error' | 'fallback'
): NextResponse {
  response.headers.set('Server-Timing', timing.serverTiming())
  const errorCode = response.headers.get('X-Roamly-Error-Code')
  response.headers.delete('X-Roamly-Error-Code')
  timing.finish({
    status: outcome === 'error' ? 'failure' : outcome,
    statusCode: response.status,
    errorCode,
  })
  return response
}

export function offerStatusCode(status: TravelOfferResultStatus): number {
  if (status === 'RATE_LIMITED') return 429
  if (status === 'TEMPORARY_FAILURE' || status === 'PROVIDER_UNAVAILABLE') return 503
  if (status === 'INVALID_REQUEST') return 400
  if (status === 'NO_RESULTS') return 404
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
  if (error instanceof TravelSelectionError) {
    return err(error.message, error.code, error.status, error.details)
  }
  if (error instanceof TripTravelSearchRequestError) {
    return err(error.message, error.code, error.status, error.details)
  }

  return err('Failed to plan trip travel', 'TRAVEL_PLANNING_FAILED', 500)
}
