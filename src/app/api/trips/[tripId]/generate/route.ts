import { NextResponse } from 'next/server'

import { generateItinerary } from '@/ai/aiService'
import { createClient } from '@/lib/supabase/server'
import {
  ExchangeRateError,
  inferDestinationCurrency,
  resolveExchangeRate,
} from '@/services/exchangeRateService'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import { getTripById, TripStatus, updateTripStatus } from '@/services/tripService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

interface RouteContext {
  params: Promise<{ tripId: string }>
}

function err(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return err('Unauthorised', 'UNAUTHORISED', 401)

  try {
    await ensureUser(session.user.id, session.user.email)
    const trip = await getTripById(tripId, session.user.id)
    if (!trip) return err('Trip not found', 'NOT_FOUND', 404)

    const preferences = await getPreferenceSet(tripId)
    if (!preferences) return err('Preferences not found', 'PREFERENCES_NOT_FOUND', 400)

    const { destination, budget, durationDays, groupSize } = preferences
    if (!destination || budget == null || durationDays == null || groupSize == null) {
      return err(
        'Destination, budget, duration, and group size are required before generation.',
        'INCOMPLETE_PREFERENCES',
        400
      )
    }

    const profileSummary = await getProfileSummary(session.user.id)
    const profile = profileSummary.profile
    if (!profile.profileComplete || !profile.preferredCurrency) {
      return err('Please complete your profile before generating an itinerary.', 'PROFILE_INCOMPLETE', 400)
    }

    const destinationCurrency = inferDestinationCurrency(destination, profile.preferredCurrency)
    const exchangeRate = await resolveExchangeRate({
      baseCurrency: destinationCurrency,
      quoteCurrency: profile.preferredCurrency,
    })

    const itinerary = await generateItinerary({
      destination,
      budget,
      durationDays,
      groupSize,
      travelStyles: preferences.travelStyles,
      accommodationType: preferences.accommodationType,
      transportationPreference: preferences.transportationPreference,
      foodPreferences: preferences.foodPreferences,
      activityPreferences: preferences.activityPreferences,
      userCurrency: profile.preferredCurrency,
      destinationCurrency,
      exchangeRate: exchangeRate.rate,
      exchangeRateSource: exchangeRate.source,
      exchangeRateFetchedAt: exchangeRate.fetchedAt.toISOString(),
      exchangeRateFromCache: exchangeRate.fromCache,
      travelInterests: profile.travelInterests,
      preferredLanguage: profile.preferredLanguage,
    })

    const updatedTrip = await updateTripStatus(tripId, TripStatus.COMPLETE, itinerary)
    return NextResponse.json({ trip: updatedTrip, itinerary })
  } catch (error) {
    if (error instanceof ExchangeRateError) {
      return err(error.message, 'EXCHANGE_RATE_UNAVAILABLE', 400)
    }
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    return err('Failed to generate itinerary', 'GENERATION_FAILED', 500, { reason: message })
  }
}
