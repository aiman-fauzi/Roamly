import type { Itinerary } from '@/types/itinerary'
import { formatCurrency } from '@/utils/formatCurrency'
import { formatDate } from '@/utils/formatDate'

interface ItineraryHeaderProps {
  itinerary: Itinerary
  destination?: string | null
}

export function ItineraryHeader({ itinerary, destination }: ItineraryHeaderProps) {
  const budget = itinerary.budget
  const budgetLabel = budget.isBudgetExceeded ? 'Budget exceeded' : 'Remaining budget'
  const budgetValue = budget.isBudgetExceeded
    ? Math.abs(budget.remainingBudgetUserCurrency)
    : budget.remainingBudgetUserCurrency

  return (
    <header className="space-y-5">
      <div>
        <div className="text-sm font-semibold uppercase tracking-wide text-atlas-700">
          {destination ?? 'Your trip'}
        </div>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-neutral-900 sm:text-4xl">
          {itinerary.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-neutral-700 sm:text-lg">
          {itinerary.summary}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-sm font-medium text-neutral-700">Estimated total</p>
          <p className="mt-1 text-xl font-bold text-neutral-900">
            {formatCurrency(budget.estimatedTotalUserCurrency, itinerary.currencyUser)}
          </p>
          <p className="text-sm text-neutral-700">
            {formatCurrency(budget.estimatedTotalLocal, itinerary.currencyLocal)} local
          </p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm font-medium text-neutral-700">{budgetLabel}</p>
          <p className={budget.isBudgetExceeded ? 'mt-1 text-xl font-bold text-error-500' : 'mt-1 text-xl font-bold text-success-500'}>
            {formatCurrency(budgetValue, itinerary.currencyUser)}
          </p>
          <p className="text-sm text-neutral-700">
            Budget {formatCurrency(budget.totalBudgetUserCurrency, itinerary.currencyUser)}
          </p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm font-medium text-neutral-700">Exchange rate</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">
            1 {itinerary.exchangeRate.baseCurrency} ={' '}
            {formatCurrency(itinerary.exchangeRate.rate, itinerary.exchangeRate.quoteCurrency)}
          </p>
          <p className="text-sm text-neutral-700">
            {itinerary.exchangeRate.source}
            {itinerary.exchangeRate.fromCache ? ' cached' : ''} -{' '}
            {formatDate(itinerary.exchangeRate.fetchedAt)}
          </p>
        </div>
      </div>
    </header>
  )
}
