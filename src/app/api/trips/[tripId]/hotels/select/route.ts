import { NextResponse } from 'next/server'

import {
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../../travelRouteUtils'

import { offerSelectionRequestSchema } from '@/lib/validations/travelOfferValidation'
import { TripOfferSelectionService } from '@/services/travel/persistence/tripOfferSelectionService'

export async function POST(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const json = await readJsonBody(request)
  if ('response' in json) return json.response

  const parsed = offerSelectionRequestSchema.safeParse(json.body)
  if (!parsed.success) {
    return err('Hotel selection request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    const selection = await new TripOfferSelectionService().selectHotel({
      tripId,
      userId: guard.userId,
      offerId: parsed.data.offerId,
      simulationMode: parsed.data.simulationMode,
      refreshOffers: parsed.data.refreshOffers,
    })
    return NextResponse.json({ hotelSelection: selection })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
