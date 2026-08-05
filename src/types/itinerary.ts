export type RoadmapItemKind =
  | 'attraction'
  | 'end'
  | 'hotel'
  | 'food'
  | 'transport'
  | 'activity'
  | 'restaurant'
  | 'shopping'
  | 'start'
  | 'nightlife'
  | 'other'

export interface ExchangeRateSnapshot {
  baseCurrency: string
  quoteCurrency: string
  rate: number
  source: string
  fetchedAt: string
  fromCache: boolean
}

export interface BudgetSummary {
  totalBudgetUserCurrency: number
  estimatedTotalLocal: number
  estimatedTotalUserCurrency: number
  remainingBudgetUserCurrency: number
  isBudgetExceeded: boolean
}

export interface ItineraryItem {
  candidateId: string
  time: string
  title: string
  description: string
  location: string
  latitude?: number
  longitude?: number
  transport: string
  estimatedDuration: string
  durationMinutes: number
  reason: string
  estimatedCostLocal: number
  estimatedCostUserCurrency: number
  currencyLocal: string
  currencyUser: string
  priceConfidence: 'KNOWN_PRICE' | 'ESTIMATED_PRICE' | 'PRICE_UNKNOWN'
  sourceEntityType?: string
  sourceEntityId?: string
  tips: string[]
}

export interface DayPlan {
  dayNumber: number
  theme: string
  morning: ItineraryItem[]
  afternoon: ItineraryItem[]
  evening: ItineraryItem[]
  dailyTotalLocal: number
  dailyTotalUserCurrency: number
  notes: string[]
}

export interface RoadmapDay {
  dayNumber: number
  items: Array<{
    label: string
    kind: RoadmapItemKind
    time?: string
  }>
}

export interface Itinerary {
  title: string
  summary: string
  selectedFlightOfferId?: string
  selectedHotelOfferId?: string
  currencyLocal: string
  currencyUser: string
  exchangeRate: ExchangeRateSnapshot
  budget: BudgetSummary
  days: DayPlan[]
  roadmap: RoadmapDay[]
}
