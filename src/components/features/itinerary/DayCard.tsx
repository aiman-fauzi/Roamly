import { ActivityItem } from '@/components/features/itinerary/ActivityItem'
import type { DayPlan, ItineraryItem } from '@/types/itinerary'
import { formatCurrency } from '@/utils/formatCurrency'

interface DayCardProps {
  day: DayPlan
}

function TimeSection({ label, items }: { label: string; items: ItineraryItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-atlas-700">{label}</h3>
      <ul className="space-y-3">
        {items.map((activity, index) => (
          <ActivityItem key={`${activity.time}-${activity.title}-${index}`} activity={activity} />
        ))}
      </ul>
    </div>
  )
}

export function DayCard({ day }: DayCardProps) {
  const firstItem = day.morning[0] ?? day.afternoon[0] ?? day.evening[0]
  const localCurrency = firstItem?.currencyLocal ?? 'USD'
  const userCurrency = firstItem?.currencyUser ?? 'USD'

  return (
    <section className="surface-panel space-y-5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-atlas-700">Day {day.dayNumber}</p>
          <h2 className="text-xl font-semibold text-neutral-900">{day.theme}</h2>
        </div>
        <div className="rounded-card bg-white px-4 py-3 shadow-card">
          <p className="text-sm font-medium text-neutral-700">Daily total</p>
          <p className="font-semibold text-neutral-900">
            {formatCurrency(day.dailyTotalUserCurrency, userCurrency)}
          </p>
          <p className="text-sm text-neutral-700">
            {formatCurrency(day.dailyTotalLocal, localCurrency)} local
          </p>
        </div>
      </div>

      <TimeSection label="Morning" items={day.morning} />
      <TimeSection label="Afternoon" items={day.afternoon} />
      <TimeSection label="Evening" items={day.evening} />

      {day.notes.length > 0 && (
        <div className="rounded-card border border-neutral-200/80 bg-white/90 p-4 text-sm text-neutral-700 shadow-card">
          <p className="font-semibold text-neutral-900">Notes</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {day.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
