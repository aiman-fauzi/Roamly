import { NextResponse } from 'next/server'

import { editorErrorResponse } from '../itinerary-editor/editorRouteUtils'

import {
  completeTimedResponse,
  requireAuthenticatedTrip,
  type RouteContext,
} from '@/app/api/trips/[tripId]/travelRouteUtils'
import { RequestTiming } from '@/lib/observability/requestTiming'
import { ItineraryRevisionService } from '@/services/itinerary/itineraryRevisionService'

export async function GET(_request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_revision_list')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  try {
    const revisions = await new ItineraryRevisionService().list(
      tripId,
      guard.userId,
      timing
    )
    return completeTimedResponse(NextResponse.json({ revisions }), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
