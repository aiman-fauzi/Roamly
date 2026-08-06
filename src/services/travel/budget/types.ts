import type { ConvertedMoney, Money } from '@/services/travel/offers/types'

export type BudgetCategoryStatus = 'KNOWN' | 'ESTIMATED' | 'PARTIAL' | 'UNKNOWN'
export type EstimatedCostBasis =
  | 'per_person'
  | 'per_room'
  | 'per_night'
  | 'per_trip'
  | 'whole_party'
export type EstimatedCostStatus = 'mock_estimate' | 'unavailable'

export interface EstimatedCost {
  amount: Money | null
  currency: string
  basis: EstimatedCostBasis
  status: EstimatedCostStatus
}

export interface BudgetCategory {
  status: BudgetCategoryStatus
  original?: Money
  converted?: ConvertedMoney
  amount: Money
  perPersonAmount?: Money
  cost?: EstimatedCost
  assumptions: string[]
  missingData: string[]
}

export interface BudgetTotal {
  amount: Money
  perPersonAmount: Money
  userBudget?: Money
  remainingBudget?: Money
  isBudgetExceeded?: boolean
}

export interface TripBudgetCostSummary {
  currency: string
  travellers: number
  wholeTripTotal: Money | null
  estimatedPerPersonTotal: Money | null
  flights: EstimatedCost
  hotel: EstimatedCost
  attractions: EstimatedCost
  food: EstimatedCost
  localTransport: EstimatedCost
  contingency: EstimatedCost
  status: 'mock_estimate'
}

export interface TripBudgetSummary {
  currency: string
  travellers?: number
  flight: BudgetCategory
  accommodation: BudgetCategory
  attractions: BudgetCategory
  food: BudgetCategory
  localTransport: BudgetCategory
  contingency: BudgetCategory
  total: BudgetTotal
  costSummary?: TripBudgetCostSummary
  assumptions: string[]
  missingData: string[]
  calculatedAt: string
}
