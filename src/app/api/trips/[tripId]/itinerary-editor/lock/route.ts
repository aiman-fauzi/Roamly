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
import { itineraryLockSchema } from '@/lib/validations/itineraryEditorValidation'
import { ItineraryEditorService } from '@/services/itinerary/itineraryEditorService'


export async function PUT(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_editor_lock')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = itineraryLockSchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Lock request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }
  try {
    const document = await new ItineraryEditorService().setLock(
      tripId,
      guard.userId,
      parsed.data,
      timing
    )
    return completeTimedResponse(NextResponse.json(document), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
