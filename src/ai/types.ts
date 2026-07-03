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
}

export type GenerateItineraryResponse = Itinerary

export interface AIProvider {
  generateItinerary(request: GenerateItineraryRequest): Promise<GenerateItineraryResponse>
}