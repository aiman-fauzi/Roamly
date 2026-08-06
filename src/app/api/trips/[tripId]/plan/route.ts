import { NextResponse } from 'next/server'

import {
  completeTimedResponse,
  err,
  readJsonBody,
  requireAuthenticatedTrip,
  routeErrorResponse,
  type RouteContext,
} from '../travelRouteUtils'

import { RequestTiming } from '@/lib/observability/requestTiming'
import {
  persistedTripTravelPlanningRequestSchema,
  tripTravelProfileUpdateSchema,
} from '@/lib/validations/travelOfferValidation'
import {
  TravelPlanningError,
  TripTravelPlanningService,
} from '@/services/travel/planning/tripTravelPlanningService'
import { TripTravelProfileService } from '@/services/travel/profile/tripTravelProfileService'

const AI_PREVIEW_FALLBACK_CODES = new Set([
  'AI_QUOTA_EXCEEDED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_TEMPORARY_FAILURE',
  'AI_NETWORK_FAILURE',
  'AI_MODEL_UNAVAILABLE',
])

function planningResponse(
  result: Awaited<ReturnType<TripTravelPlanningService['previewBudget']>>,
  generationStatus?: {
    status: 'planning_preview_due_to_ai_failure'
    code: string
    message: string
  }
) {
  return NextResponse.json({
    trip: result.trip,
    itinerary: null,
    itineraryStatus: generationStatus ?? { status: 'not_generated' },
    budgetSummary: result.budgetSummary,
    itineraryTravelContext: result.itineraryTravelContext,
    planningPreview: result.planningPreview,
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
}

export async function POST(request: Request, { params }: RouteContext) {
  const timing = new RequestTiming('travel_plan_post')
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId, timing)
  if ('response' in guard) return completeTimedResponse(guard.response, timing, 'error')

  const json = await readJsonBody(request)
  if ('response' in json) return completeTimedResponse(json.response, timing, 'error')

  const parsed = persistedTripTravelPlanningRequestSchema.safeParse(json.body ?? {})
  if (!parsed.success) {
    return completeTimedResponse(
      err('Travel planning request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten()),
      timing,
      'error'
    )
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
    const planningService = new TripTravelPlanningService()
    const planningInput = { ...parsed.data, persist: parsed.data.persist ?? true }
    const result = await planningService.plan({
      tripId,
      userId: guard.userId,
      input: planningInput,
      timing,
    })

    return completeTimedResponse(
      NextResponse.json({
        trip: result.trip,
        itinerary: result.itinerary,
        itineraryStatus: { status: 'generated' },
        budgetSummary: result.budgetSummary,
        itineraryTravelContext: result.itineraryTravelContext,
        planningPreview: result.planningPreview,
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
      }),
      timing,
      'success'
    )
  } catch (error) {
    if (error instanceof TravelPlanningError && AI_PREVIEW_FALLBACK_CODES.has(error.code)) {
      const preview = await new TripTravelPlanningService().previewBudget({
        tripId,
        userId: guard.userId,
        input: { ...parsed.data, persist: false },
        timing,
      })
      return completeTimedResponse(
        planningResponse(preview, {
          status: 'planning_preview_due_to_ai_failure',
          code: error.code,
          message:
            'We could not generate the full itinerary right now. Your sample travel plan and recommended places are still available.',
        }),
        timing,
        'fallback'
      )
    }
    return completeTimedResponse(routeErrorResponse(error), timing, 'error')
  }
}
