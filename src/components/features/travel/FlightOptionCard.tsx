import { MockDataBadge, MockDataNotice } from './MockDataBadge'

import { Card } from '@/components/ui/Card'
import type { FlightOption } from '@/services/travel/flights/types'
import { formatCurrency } from '@/utils/formatCurrency'

interface FlightOptionCardProps {
  option: FlightOption
  title: string
  selected?: boolean
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso))
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export function FlightOptionCard({ option, title, selected = false }: FlightOptionCardProps) {
  return (
    <Card
      className={
        selected ? 'space-y-4 border-2 border-atlas-500' : 'space-y-4 border-l-4 border-l-atlas-500'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <MockDataBadge />
          </div>
          <p className="mt-1 text-sm text-neutral-700">
            {option.airlineName} {option.flightNumber}
          </p>
        </div>
        <p className="text-lg font-semibold text-neutral-900">
          {formatCurrency(option.fare.totalAmount, option.fare.currency)}
          <span className="block text-xs font-medium text-neutral-600">
            {option.travellerCount} traveller{option.travellerCount === 1 ? '' : 's'}
          </span>
        </p>
      </div>

      <dl className="grid gap-3 text-sm text-neutral-700 sm:grid-cols-5">
        <div>
          <dt className="font-medium text-neutral-900">Route</dt>
          <dd>
            {option.originAirportCode} to {option.destinationAirportCode}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Time</dt>
          <dd>
            {formatTime(option.departureAt)} to {formatTime(option.arrivalAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Duration</dt>
          <dd>{formatDuration(option.durationMinutes)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Per traveller</dt>
          <dd>{formatCurrency(option.fare.perTravellerTotalAmount, option.fare.currency)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Baggage</dt>
          <dd>
            {option.baggage.cabinKg ?? '-'}kg cabin, {option.baggage.checkedKg ?? '-'}kg checked
          </dd>
        </div>
      </dl>
      <MockDataNotice />
    </Card>
  )
}
