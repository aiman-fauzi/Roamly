import type { ConvertedMoney, Money } from '@/services/travel/offers/types'

export type BudgetCategoryStatus = 'KNOWN' | 'ESTIMATED' | 'PARTIAL' | 'UNKNOWN'

export interface BudgetCategory {
  status: BudgetCategoryStatus
  original?: Money
  converted?: ConvertedMoney
  amount: Money
  perPersonAmount?: Money
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

export interface TripBudgetSummary {
  currency: string
  flight: BudgetCategory
  accommodation: BudgetCategory
  attractions: BudgetCategory
  food: BudgetCategory
  localTransport: BudgetCategory
  contingency: BudgetCategory
  total: BudgetTotal
  assumptions: string[]
  missingData: string[]
  calculatedAt: string
}
