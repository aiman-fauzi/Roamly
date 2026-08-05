import { NextResponse } from 'next/server'

import {
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { TripOfferSelectionService } from '@/services/travel/persistence/tripOfferSelectionService'

export async function GET(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  try {
    const selections = await new TripOfferSelectionService().getSelections({
      tripId,
      userId: guard.userId,
    })
    return NextResponse.json(selections)
  } catch (error) {
    return routeErrorResponse(error)
  }
}
