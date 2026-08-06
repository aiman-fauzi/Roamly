import { MockDataBadge } from './MockDataBadge'

import { Card } from '@/components/ui/Card'
import type { TripBudgetEstimate } from '@/services/travel/budget/mockTripBudgetEstimate'
import type { TripBudgetCostSummary, TripBudgetSummary } from '@/services/travel/budget/types'
import type { Money } from '@/services/travel/offers/types'
import { formatCurrency } from '@/utils/formatCurrency'

interface TripCostSummaryProps {
  estimate?: TripBudgetEstimate
  budgetSummary?: TripBudgetSummary
  costSummary?: TripBudgetCostSummary
}

function amount(value: number | null, currency: string): string {
  return value == null ? 'Unavailable' : formatCurrency(value, currency)
}

function moneyAmount(value: Money | null, unavailableLabel = 'Unavailable'): string {
  return value == null ? unavailableLabel : formatCurrency(Number(value.amount), value.currency)
}

export function TripCostSummary({ estimate, budgetSummary, costSummary }: TripCostSummaryProps) {
  const summary = costSummary ?? budgetSummary?.costSummary
  if (summary) {
    const rows = [
      ['Flights', summary.flights.amount, 'Selected sample round trip'],
      ['Hotel', summary.hotel.amount, 'Complete stay'],
      ['Food', summary.food.amount, 'Per traveller estimate'],
      ['Local transport', summary.localTransport.amount, 'Per traveller estimate'],
      ['Attractions', summary.attractions.amount, 'Attraction costs not yet estimated'],
      ['Contingency', summary.contingency.amount, 'Mock estimate buffer'],
    ] as const

    return (
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-900">Trip cost estimate</h3>
          <MockDataBadge label="Mock estimate" />
        </div>
        <p className="text-sm font-medium text-amber-800">
          Estimated sample costs - live prices and availability are not connected.
        </p>
        <dl className="grid gap-3 text-sm text-neutral-700 sm:grid-cols-2">
          {rows.map(([label, value, helper]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-2"
            >
              <dt>
                <span className="font-medium text-neutral-900">{label}</span>
                <span className="block text-xs text-neutral-600">{helper}</span>
              </dt>
              <dd className="text-right font-medium text-neutral-900">
                {label === 'Attractions'
                  ? moneyAmount(value, 'Not yet estimated')
                  : moneyAmount(value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-neutral-950 px-4 py-3 text-white">
            <p className="text-sm font-medium">Estimated whole trip</p>
            <p className="mt-1 text-lg font-semibold">{moneyAmount(summary.wholeTripTotal)}</p>
          </div>
          <div className="rounded-md bg-neutral-100 px-4 py-3 text-neutral-900">
            <p className="text-sm font-medium">Estimated per person</p>
            <p className="mt-1 text-lg font-semibold">
              {moneyAmount(summary.estimatedPerPersonTotal)}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (!estimate) return null
  const rows = [
    ['Flights', estimate.flightsTotal],
    ['Hotel', estimate.hotelTotal],
    ['Attractions', estimate.attractionsTotal],
    ['Food', estimate.foodTotal],
    ['Local transport', estimate.localTransportTotal],
    ['Contingency', estimate.contingencyTotal],
  ] as const

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">Trip cost estimate</h3>
        <MockDataBadge label="Mock estimate" />
      </div>
      <dl className="grid gap-3 text-sm text-neutral-700 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2"
          >
            <dt className="font-medium text-neutral-900">{label}</dt>
            <dd>{amount(value, estimate.currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-950 px-4 py-3 text-white">
        <span className="text-sm font-medium">Estimated total</span>
        <span className="text-lg font-semibold">
          {formatCurrency(estimate.estimatedGrandTotal, estimate.currency)}
        </span>
      </div>
      {estimate.missingEstimates.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {estimate.missingEstimates.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}
