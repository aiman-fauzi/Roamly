import type { GeminiDestinationContext } from '@/services/destinations/types'
import type { TripBudgetSummary } from '@/services/travel/budget/types'
import type { TravelOffersGeminiContext } from '@/services/travel/offers/types'
import type { ItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'
import type { DayPlan, Itinerary, ItineraryItem } from '@/types/itinerary'

export type { DayPlan, ItineraryItem }

export interface GenerateItineraryRequest {
  observabilityRequestId?: string
  destination: string
  budget: number
  durationDays: number
  groupSize: number
  travelStyles: string[]
  accommodationType: string | null
  transportationPreference: string | null
  foodPreferences: string[]
  activityPreferences: string[]
  userCurrency: string
  destinationCurrency: string
  exchangeRate: number
  exchangeRateSource: string
  exchangeRateFetchedAt: string
  exchangeRateFromCache: boolean
  travelInterests: string[]
  preferredLanguage: string | null
  destinationContext?: GeminiDestinationContext
  travelOffersContext?: TravelOffersGeminiContext
  budgetSummary?: TripBudgetSummary
}

export type GenerateItineraryResponse = Itinerary & {
  itineraryTravelContext?: ItineraryTravelContext
  planningPreview?: ItineraryTravelContext['planningPreview']
  budgetSummary?: TripBudgetSummary
}

export type AIErrorCategory =
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_TEMPORARY_FAILURE'
  | 'AI_NETWORK_FAILURE'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_SCHEMA_VALIDATION_FAILURE'
  | 'AI_UNSUPPORTED_CANDIDATE'
  | 'AI_AUTHENTICATION_FAILURE'
  | 'AI_AUTHENTICATION_FAILED'
  | 'AI_UNKNOWN_FAILURE'

export interface AIProvider {
  generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse>
}
