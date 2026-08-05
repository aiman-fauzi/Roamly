import { NextResponse } from 'next/server'

import {
  err,
  offerStatusCode,
  readJsonBody,
  requireAuthenticatedTrip,
  type RouteContext,
} from '../travelRouteUtils'

import { hotelSearchRequestSchema } from '@/lib/validations/travelOfferValidation'
import { createDefaultTravelOfferService } from '@/services/travel/offers/travelOfferService'

export async function POST(request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const guard = await requireAuthenticatedTrip(tripId)
  if ('response' in guard) return guard.response

  const json = await readJsonBody(request)
  if ('response' in json) return json.response

  const parsed = hotelSearchRequestSchema.safeParse(json.body)
  if (!parsed.success) {
    return err('Hotel search request is invalid.', 'VALIDATION_ERROR', 400, parsed.error.flatten())
  }

  try {
    const { refresh, ...searchRequest } = parsed.data
    const result = await createDefaultTravelOfferService().searchHotels(searchRequest, { refresh })
    if (result.status !== 'SUCCESS' && result.status !== 'NO_RESULTS') {
      return err('Hotel offers are unavailable for this search.', `HOTEL_${result.status}`, offerStatusCode(result.status), {
        provider: result.provider,
        status: result.status,
        cacheStatus: result.cacheStatus,
        fetchedAt: result.fetchedAt,
        expiresAt: result.expiresAt,
        warning: result.warning,
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown hotel search error'
    return err('Failed to search hotel offers', 'HOTEL_SEARCH_FAILED', 500, { reason: message })
  }
}
