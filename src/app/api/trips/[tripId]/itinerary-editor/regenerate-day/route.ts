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
import { itineraryRegenerateDaySchema } from '@/lib/validations/itineraryEditorValidation'
import { ItineraryEditorService } from '@/services/itinerary/itineraryEditorService'


export const maxDuration = 60

export async function POST(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('itinerary_regenerate_day_post')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = itineraryRegenerateDaySchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Day regeneration request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }
  try {
    const result = await new ItineraryEditorService().regenerateDay(
      tripId,
      guard.userId,
      parsed.data,
      timing
    )
    const response = NextResponse.json(result, {
      status: result.state === 'fallback_ready' ? 202 : 200,
    })
    return completeTimedResponse(
      response,
      timing,
      result.state === 'fallback_ready' ? 'fallback' : 'success'
    )
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
