import { NextResponse } from 'next/server'

import { editorErrorResponse } from '../editorRouteUtils'

import {
  completeTimedResponse,
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  type RouteContext,
} from '@/app/api/trips/[tripId]/travelRouteUtils'
import { RequestTiming } from '@/lib/observability/requestTiming'
import { itineraryRevisionMutationSchema } from '@/lib/validations/itineraryEditorValidation'
import { ItineraryRevisionService } from '@/services/itinerary/itineraryRevisionService'

export async function POST(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_revision_undo')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = itineraryRevisionMutationSchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Undo request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }
  try {
    const result = await new ItineraryRevisionService().undo(
      tripId,
      guard.userId,
      parsed.data.expectedVersion,
      timing
    )
    return completeTimedResponse(NextResponse.json(result), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
