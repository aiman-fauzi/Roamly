import { NextResponse } from 'next/server'

import {
  err,
  completeTimedResponse,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { RequestTiming } from '@/lib/observability/requestTiming'
import {
  travelSelectionClearSchema,
  travelSelectionSaveSchema,
} from '@/lib/validations/travelOfferValidation'
import { TripTravelSelectionService } from '@/services/travel/persistence/tripTravelSelectionService'

export async function GET(_request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('travel_selection_get')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')

  try {
    const result = await new TripTravelSelectionService().get({
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

export async function PUT(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('travel_selection_put')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')

  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')
  const parsed = travelSelectionSaveSchema.safeParse(json.body)
  if (!parsed.success) {
    return completeTimedResponse(
      err('Travel selection request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
  }

  try {
    const result = await new TripTravelSelectionService().save({
      tripId,
      userId: guard.userId,
      ownedTrip: guard.trip,
      selection: parsed.data,
      timing,
    })
    return completeTimedResponse(NextResponse.json(result), timing, 'success')
  } catch (error) {
    return completeTimedResponse(routeErrorResponse(error), timing, 'error')
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('travel_selection_delete')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')

  const parsed = travelSelectionClearSchema.safeParse({
    expectedVersion: new URL(request.url).searchParams.get('expectedVersion'),
  })
  if (!parsed.success) {
    return completeTimedResponse(
      err(
        'Travel selection clear request is invalid.',
        'VALIDATION_ERROR',
        400,
        parsed.error.flatten()
      ),
      timing,
      'error'
    )
  }

  try {
    const result = await new TripTravelSelectionService().clear({
      tripId,
      userId: guard.userId,
      ownedTrip: guard.trip,
      expectedVersion: parsed.data.expectedVersion,
      timing,
    })
    return completeTimedResponse(NextResponse.json(result), timing, 'success')
  } catch (error) {
    return completeTimedResponse(routeErrorResponse(error), timing, 'error')
  }
}
