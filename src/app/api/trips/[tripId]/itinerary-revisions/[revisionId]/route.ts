import { NextResponse } from 'next/server'

import { editorErrorResponse } from '../../itinerary-editor/editorRouteUtils'

import {
  completeTimedResponse,
  requireAuthenticatedTrip,
} from '@/app/api/trips/[tripId]/travelRouteUtils'
import { RequestTiming } from '@/lib/observability/requestTiming'
import { ItineraryRevisionService } from '@/services/itinerary/itineraryRevisionService'

interface RevisionRouteContext {
  params: Promise<{ tripId: string; revisionId: string }>
}

export async function GET(_request: Request, { params }: RevisionRouteContext) {
  const timing = new RequestTiming('itinerary_revision_preview')
  const { tripId, revisionId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  try {
    const preview = await new ItineraryRevisionService().preview(
      tripId,
      guard.userId,
      revisionId,
      timing
    )
    return completeTimedResponse(NextResponse.json(preview), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
