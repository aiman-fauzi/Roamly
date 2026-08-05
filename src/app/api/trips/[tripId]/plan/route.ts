import { NextResponse } from 'next/server'

import {
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { tripTravelPlanningRequestSchema } from '@/lib/validations/travelOfferValidation'
import { TripTravelPlanningService } from '@/services/travel/planning/tripTravelPlanningService'

export async function POST(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const json = await readJsonBody(request)
  if ('response' in json) return json.response

  const parsed = tripTravelPlanningRequestSchema.safeParse(json.body)
  if (!parsed.success) {
    return err('Travel planning request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    const result = await new TripTravelPlanningService().plan({
      tripId,
      userId: guard.userId,
      input: { ...parsed.data, persist: parsed.data.persist ?? true },
    })

    return NextResponse.json({
      trip: result.trip,
      itinerary: result.itinerary,
      budgetSummary: result.budgetSummary,
      selectedFlightOffer: result.selectedFlightOffer,
      selectedHotelOffer: result.selectedHotelOffer,
      flightSearch: result.flightSearch,
      hotelSearch: result.hotelSearch,
      destinationContext: {
        eligibleCandidates: result.summary.eligibleCandidates,
        candidatesSentToGemini: result.summary.candidatesSentToGemini,
        omittedCandidates: result.summary.candidatesOmitted,
      },
      summary: result.summary,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
