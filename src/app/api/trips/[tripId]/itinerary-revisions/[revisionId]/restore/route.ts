import { NextResponse } from 'next/server'

import { editorErrorResponse } from '../../../itinerary-editor/editorRouteUtils'

import {
  completeTimedResponse,
  err,
  readJsonBody,
  requireAuthenticatedTrip,
} from '@/app/api/trips/[tripId]/travelRouteUtils'
import { RequestTiming } from '@/lib/observability/requestTiming'
import { itineraryRevisionMutationSchema } from '@/lib/validations/itineraryEditorValidation'
import { ItineraryRevisionService } from '@/services/itinerary/itineraryRevisionService'

interface RevisionRouteContext {
  params: Promise<{ tripId: string; revisionId: string }>
}

export async function POST(request: Request, { params }: RevisionRouteContext) {
  const timing = new RequestTiming('itinerary_revision_restore')
  const { tripId, revisionId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')
  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = itineraryRevisionMutationSchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Restore request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }
  try {
    const document = await new ItineraryRevisionService().restore(
      tripId,
      guard.userId,
      revisionId,
      parsed.data.expectedVersion,
      timing
    )
    return completeTimedResponse(NextResponse.json(document), timing, 'success')
  } catch (error) {
    return completeTimedResponse(editorErrorResponse(error), timing, 'error')
  }
}
