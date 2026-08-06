import { NextResponse } from 'next/server'

import {
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import {
  travelSelectionClearSchema,
  travelSelectionSaveSchema,
} from '@/lib/validations/travelOfferValidation'
import { TripTravelSelectionService } from '@/services/travel/persistence/tripTravelSelectionService'

export async function GET(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  try {
    const result = await new TripTravelSelectionService().get({
      tripId,
      userId: guard.userId,
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
  const parsed = travelSelectionSaveSchema.safeParse(json.body)
  if (!parsed.success) {
    return err(
      'Travel selection request is invalid.',
      'VALIDATION_ERROR',
      400,
      parsed.error.flatten()
    )
  }

  try {
    const result = await new TripTravelSelectionService().save({
      tripId,
      userId: guard.userId,
      selection: parsed.data,
    })
    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const parsed = travelSelectionClearSchema.safeParse({
    expectedVersion: new URL(request.url).searchParams.get('expectedVersion'),
  })
  if (!parsed.success) {
    return err(
      'Travel selection clear request is invalid.',
      'VALIDATION_ERROR',
      400,
      parsed.error.flatten()
    )
  }

  try {
    const result = await new TripTravelSelectionService().clear({
      tripId,
      userId: guard.userId,
      expectedVersion: parsed.data.expectedVersion,
    })
    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error)
  }
}
