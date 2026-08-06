import { NextResponse } from 'next/server'

import { requireApiUser } from '@/app/api/authRouteUtils'
import { ExchangeRateError } from '@/services/exchangeRateService'
import {
  ItineraryGenerationError,
  ItineraryGenerationService,
} from '@/services/itinerary/itineraryGenerationService'
import { ensureUser } from '@/services/userService'
import type { ApiErrorResponse } from '@/types/api'

interface RouteContext {
  params: Promise<{ tripId: string }>
}

export const maxDuration = 60

function err(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({ error, code, details }, { status })
}

function readNestedDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined
  const maybeRecoverable = details as { details?: unknown }
  if (maybeRecoverable.details && typeof maybeRecoverable.details === 'object') {
    return maybeRecoverable.details as Record<string, unknown>
  }
  return details as Record<string, unknown>
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function generationErrorMessage(error: ItineraryGenerationError): string {
  if (error.code === 'AI_TIMEOUT') {
    return 'Itinerary generation timed out. Please try again in a moment.'
  }
  if (error.code === 'AI_RATE_LIMITED') {
    return 'Itinerary generation is temporarily rate limited. Please try again shortly.'
  }
  if (error.code === 'AI_CONTRACT_VIOLATION') {
    const details = readNestedDetails(error.details)
    const duplicateIds = readStringArray(details?.duplicateCandidateIds)
    const unsupportedIds = [
      ...readStringArray(details?.unsupportedCandidateIds),
      ...readStringArray(details?.unknownCandidateIds),
    ]
    const issues = readStringArray(details?.validationIssues).join(' ').toLowerCase()

    if (duplicateIds.length > 0 || issues.includes('duplicated')) {
      return 'The itinerary generator reused a destination. Please try again.'
    }
    if (unsupportedIds.length > 0 || issues.includes('unknown candidate')) {
      return 'The itinerary generator referenced a destination Roamly did not offer. Please try again.'
    }
  }
  return error.message
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { tripId } = await params
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  try {
    await ensureUser(auth.user.id, auth.user.email)
    const result = await new ItineraryGenerationService().generate({
      tripId,
      userId: auth.user.id,
      persist: true,
    })
    return NextResponse.json({
      trip: result.trip,
      itinerary: result.itinerary,
      destinationContext: {
        eligibleCandidates: result.summary.eligibleCandidates,
        candidatesSentToGemini: result.summary.candidatesSent,
        omittedCandidates: result.summary.candidatesOmitted,
        contextSize: result.summary.contextSerializedSize,
        generationLatencyMs: result.summary.generationLatencyMs,
      },
    })
  } catch (error) {
    if (error instanceof ExchangeRateError) {
      return err(error.message, 'EXCHANGE_RATE_UNAVAILABLE', 400)
    }
    if (error instanceof ItineraryGenerationError) {
      return err(generationErrorMessage(error), error.code, error.status, error.details)
    }
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    return err('Failed to generate itinerary', 'GENERATION_FAILED', 500, { reason: message })
  }
}
