import { NextResponse } from 'next/server'

import { editorErrorResponse } from './editorRouteUtils'

import {
  completeTimedResponse,
  requireAuthenticatedTrip,
  type RouteContext,
} from '@/app/api/trips/[tripId]/travelRouteUtils'
import { RequestTiming } from '@/lib/observability/requestTiming'
import { ItineraryEditorService } from '@/services/itinerary/itineraryEditorService'


export async function GET(_request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_editor_get')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  try {
    const document = await new ItineraryEditorService().get(tripId, guard.userId)
    return completeTimedResponse(NextResponse.json(document), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
