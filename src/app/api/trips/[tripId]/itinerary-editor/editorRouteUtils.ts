import type { NextResponse } from 'next/server'

import { err } from '@/app/api/trips/[tripId]/travelRouteUtils'
import { ItineraryEditorError } from '@/services/itinerary/itineraryEditorService'

export function editorErrorResponse(error: unknown): NextResponse {
  if (error instanceof ItineraryEditorError) {
    return err(error.message, error.code, error.status, error.details)
  }
  return err('Failed to update itinerary.', 'ITINERARY_EDITOR_FAILED', 500)
}
