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
import { itineraryReplaceSchema } from '@/lib/validations/itineraryEditorValidation'
import { ItineraryEditorService } from '@/services/itinerary/itineraryEditorService'


export async function GET(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_replacement_options_get')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const itemId = new URL(request.url).searchParams.get('itemId')
  if (!itemId || itemId.length > 260) {
    return completeTimedResponse(
      err('Replacement item is invalid.', 'VALIDATION_ERROR', 400),
      timing,
      'error'
    )
  }
  try {
    const options = await new ItineraryEditorService().replacementOptions(
      tripId,
      guard.userId,
      itemId,
      timing
    )
    return completeTimedResponse(NextResponse.json({ options }), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_replace_put')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = itineraryReplaceSchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Replacement request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }
  try {
    const document = await new ItineraryEditorService().replace(
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
