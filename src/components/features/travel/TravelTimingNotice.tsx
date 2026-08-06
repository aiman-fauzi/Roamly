import type { TravelTimingConstraints } from '@/services/travel/planning/travelTiming'

interface TravelTimingNoticeProps {
  timing: TravelTimingConstraints
}

function recommendationLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function ArrivalDayNotice({ timing }: TravelTimingNoticeProps) {
  return (
    <section className="rounded-card border border-atlas-100 bg-atlas-50 p-4">
      <h3 className="text-atlas-900 text-sm font-semibold">Arrival day planning</h3>
      <p className="text-atlas-800 mt-1 text-sm">
        Usable time starts around {timing.dayOne.usableStartTime ?? 'unavailable'} based on sample
        flight timing and planning buffers.
      </p>
      <p className="text-atlas-900 mt-2 text-sm font-medium">
        {recommendationLabel(timing.dayOne.recommendation)}
      </p>
    </section>
  )
}

export function DepartureDayNotice({ timing }: TravelTimingNoticeProps) {
  return (
    <section className="rounded-card border border-teal-100 bg-teal-50 p-4">
      <h3 className="text-sm font-semibold text-teal-900">Departure day planning</h3>
      <p className="mt-1 text-sm text-teal-800">
        Leave the hotel by {timing.finalDay.latestHotelDepartureTime ?? 'unavailable'} using sample
        airport-transfer and check-in buffers.
      </p>
      <p className="mt-2 text-sm font-medium text-teal-900">
        {recommendationLabel(timing.finalDay.recommendation)}
      </p>
    </section>
  )
}
