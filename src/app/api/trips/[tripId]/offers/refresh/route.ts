import { NextResponse } from 'next/server'

import {
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../../travelRouteUtils'

import {
  persistedTripTravelPlanningRequestSchema,
  tripTravelProfileUpdateSchema,
} from '@/lib/validations/travelOfferValidation'
import { TripTravelPlanningService } from '@/services/travel/planning/tripTravelPlanningService'
import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'

export async function POST(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const json = await readJsonBody(request)
  if ('response' in json) return json.response

  const parsed = persistedTripTravelPlanningRequestSchema.safeParse(json.body ?? {})
  if (!parsed.success) {
    return err('Travel offer refresh request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    const profileUpdate = tripTravelProfileUpdateSchema.parse(parsed.data)
    if (Object.keys(profileUpdate).length > 0) {
      await new TripTravelProfileService().upsert({
        tripId,
        userId: guard.userId,
        data: profileUpdate,
        hasCompleteItinerary: Boolean(guard.trip.itineraryJson),
      })
    }
    const result = await new TripTravelPlanningService().previewBudget({
      tripId,
      userId: guard.userId,
      input: { ...parsed.data, refreshOffers: true, persist: false },
    })

    return NextResponse.json({
      flightSearch: result.flightSearch,
      hotelSearch: result.hotelSearch,
      rankedFlightOffers: result.rankedFlightOffers,
      rankedHotelOffers: result.rankedHotelOffers,
      selectedFlightOffer: result.selectedFlightOffer,
      selectedHotelOffer: result.selectedHotelOffer,
      budgetSummary: result.budgetSummary,
      summary: result.summary,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
