import type { GeminiDestinationContext } from '@/services/destinations/types'
import type { TripBudgetSummary } from '@/services/travel/budget/types'
import type { TravelOffersGeminiContext } from '@/services/travel/offers/types'
import type { DayPlan, Itinerary, ItineraryItem } from '@/types/itinerary'

export type { DayPlan, ItineraryItem }

export interface GenerateItineraryRequest {
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

export type GenerateItineraryResponse = Itinerary

export type AIErrorCategory =
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_TEMPORARY_FAILURE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_AUTHENTICATION_FAILED'
  | 'AI_UNKNOWN_FAILURE'

export interface AIProvider {
  generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse>
}
