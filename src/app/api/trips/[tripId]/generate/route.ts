import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  ExchangeRateError,
} from '@/services/exchangeRateService'
import {
  ItineraryGenerationError,
  ItineraryGenerationService,
} from '@/services/itinerary/itineraryGenerationService'
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
    const result = await new ItineraryGenerationService().generate({
      tripId,
      userId: session.user.id,
      persist: true,
    })
    return NextResponse.json({
      trip: result.trip,
      itinerary: result.itinerary,
      destinationContext: {
        eligibleCandidates: result.summary.eligibleCandidates,
        candidatesSentToGemini: result.summary.candidatesSent,
        omittedCandidates: result.summary.candidatesOmitted,
      },
    })
  } catch (error) {
    if (error instanceof ExchangeRateError) {
      return err(error.message, 'EXCHANGE_RATE_UNAVAILABLE', 400)
    }
    if (error instanceof ItineraryGenerationError) {
      return err(error.message, error.code, error.status, error.details)
    }
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    return err('Failed to generate itinerary', 'GENERATION_FAILED', 500, { reason: message })
  }
}
