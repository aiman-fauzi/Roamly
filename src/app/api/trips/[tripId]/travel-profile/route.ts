import { NextResponse } from 'next/server'

import {
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { tripTravelProfileUpdateSchema } from '@/lib/validations/travelOfferValidation'
import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'

export async function GET(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  try {
    const result = await new TripTravelProfileService().getForTrip({
      tripId,
      userId: guard.userId,
      hasCompleteItinerary: Boolean(guard.trip.itineraryJson),
    })
    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error)
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const json = await readJsonBody(request)
  if ('response' in json) return json.response

  const parsed = tripTravelProfileUpdateSchema.safeParse(json.body)
  if (!parsed.success) {
    return err('Travel profile request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    const result = await new TripTravelProfileService().upsert({
      tripId,
      userId: guard.userId,
      data: parsed.data,
      hasCompleteItinerary: Boolean(guard.trip.itineraryJson),
    })
    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error)
  }
}
