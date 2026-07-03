import type { ItineraryItem } from '@/types/itinerary'
import { formatCurrency } from '@/utils/formatCurrency'

interface ActivityItemProps {
  activity: ItineraryItem
}

export function ActivityItem({ activity }: ActivityItemProps) {
  return (
    <li className="rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary-700">{activity.time}</p>
          <h3 className="font-semibold text-neutral-900">{activity.title}</h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-neutral-900">
            {formatCurrency(activity.estimatedCostLocal, activity.currencyLocal)}
          </p>
          <p className="text-sm text-neutral-700">
            approx {formatCurrency(activity.estimatedCostUserCurrency, activity.currencyUser)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-700">{activity.description}</p>
      <dl className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
        <div>
          <dt className="font-medium text-neutral-900">Transport</dt>
          <dd>{activity.transport}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Duration</dt>
          <dd>{activity.estimatedDuration}</dd>
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