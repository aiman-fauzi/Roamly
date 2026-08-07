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
  itemId?: string
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
  category?: string
  area?: string
  areaGroup?: string
  locked?: boolean
  editorNotes?: string
  source?: 'generated' | 'manual' | 'fallback'
  replacedFromCandidateId?: string
  image?: {
    url: string
    altText?: string
    attribution?: string
    licenseName?: string
    licenseUrl?: string
    sourceUrl?: string
  }
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

export type ItineraryPeriod = 'morning' | 'afternoon' | 'evening'

export interface ItineraryMapPoint {
  itemId: string
  candidateId: string
  dayNumber: number
  orderIndex: number
  title: string
  latitude: number
  longitude: number
  category: string
  areaGroup: string | null
}

export type ItineraryRevisionAction =
  | 'reorder_item'
  | 'move_item'
  | 'lock_item'
  | 'unlock_item'
  | 'update_notes'
  | 'replace_item'
  | 'regenerate_day'
  | 'apply_fallback_day'
  | 'generate_itinerary'
  | 'restore_revision'

export interface ItineraryRevisionSummary {
  id: string
  revisionNumber: number
  actionType: ItineraryRevisionAction
  actionSummary: string
  editVersion: number
  createdAt: string
  isRestorable: boolean
}

export interface ItineraryRevisionPreviewItem {
  itemId: string
  title: string
  category: string
  orderIndex: number
  locked: boolean
  notes: string | null
}

export interface ItineraryRevisionPreview {
  id: string
  revisionNumber: number
  actionType: ItineraryRevisionAction
  actionSummary: string
  createdAt: string
  isRestorable: boolean
  dayCount: number
  itemCount: number
  lockedItemCount: number
  days: Array<{
    dayNumber: number
    theme: string
    items: ItineraryRevisionPreviewItem[]
  }>
  mapPoints: ItineraryMapPoint[]
}

export interface ItineraryEditorDocument {
  itineraryId: string
  version: number
  itinerary: Itinerary
  mapPoints: ItineraryMapPoint[]
  dayDates: Record<number, string>
  dayNotices: Record<number, string[]>
}

export interface ItineraryReplacementOption {
  candidateId: string
  name: string
  category: string
  area: string
  reason: string
  latitude: number
  longitude: number
  image?: ItineraryItem['image']
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
