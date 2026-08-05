import type { ItineraryItem } from '@/types/itinerary'
import { formatCurrency } from '@/utils/formatCurrency'

interface ActivityItemProps {
  activity: ItineraryItem
}

function formatPrice(activity: ItineraryItem): { primary: string; secondary?: string } {
  if (activity.priceConfidence === 'PRICE_UNKNOWN') return { primary: 'Price unavailable' }
  if (activity.priceConfidence === 'KNOWN_PRICE' && activity.estimatedCostLocal === 0) {
    return { primary: 'Free' }
  }

  const primary = formatCurrency(activity.estimatedCostLocal, activity.currencyLocal)
  const secondary =
    activity.currencyLocal === activity.currencyUser
      ? undefined
      : `approx ${formatCurrency(activity.estimatedCostUserCurrency, activity.currencyUser)}`

  return {
    primary: activity.priceConfidence === 'ESTIMATED_PRICE' ? `Estimated ${primary}` : primary,
    secondary,
  }
}

function formatDuration(activity: ItineraryItem): string {
  const minutes = activity.durationMinutes
  if (!Number.isInteger(minutes) || minutes <= 0) return activity.estimatedDuration
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  const hourLabel = `${hours} hr${hours === 1 ? '' : 's'}`
  return remainingMinutes === 0 ? hourLabel : `${hourLabel} ${remainingMinutes} min`
}

function formatTransport(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!normalized || normalized === 'transport' || normalized === 'not calculated') return 'Transport not calculated'
  if (normalized === 'public' || normalized === 'public transport') return 'Public transport'
  if (normalized === 'walk' || normalized === 'walking') return 'Walk'
  return value
}

export function ActivityItem({ activity }: ActivityItemProps) {
  const price = formatPrice(activity)

  return (
    <li className="rounded-card border border-neutral-200/80 bg-white/90 p-4 shadow-card backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-atlas-700">{activity.time}</p>
          <h3 className="font-semibold text-neutral-900">{activity.title}</h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-neutral-900">
            {price.primary}
          </p>
          {price.secondary && <p className="text-sm text-neutral-700">{price.secondary}</p>}
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-700">{activity.description}</p>
      <dl className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
        <div>
          <dt className="font-medium text-neutral-900">Transport</dt>
          <dd>{formatTransport(activity.transport)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Duration</dt>
          <dd>{formatDuration(activity)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Location</dt>
          <dd>{activity.location}</dd>
        </div>
      </dl>
      {activity.tips.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {activity.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </li>
  )
}
