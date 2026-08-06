import { NextResponse } from 'next/server'

import {
  completeTimedResponse,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { RequestTiming } from '@/lib/observability/requestTiming'
import { TripTravelSelectionService } from '@/services/travel/persistence/tripTravelSelectionService'

export async function GET(_request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('travel_planning_preview_get')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')

  try {
    const result = await new TripTravelSelectionService().getPlanningPreview({
      tripId,
      userId: guard.userId,
      ownedTrip: guard.trip,
      timing,
    })
    return completeTimedResponse(NextResponse.json(result), timing, 'success')
  } catch (error) {
    return completeTimedResponse(routeErrorResponse(error), timing, 'error')
  }
}
