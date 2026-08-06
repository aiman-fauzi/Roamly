import { MockDataBadge, MockDataNotice } from './MockDataBadge'

import { Card } from '@/components/ui/Card'
import type { HotelOption } from '@/services/travel/hotels/types'
import { formatCurrency } from '@/utils/formatCurrency'

interface HotelOptionCardProps {
  option: HotelOption
  selected?: boolean
}

function areaLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function HotelOptionCard({ option, selected = false }: HotelOptionCardProps) {
  return (
    <Card
      className={
        selected ? 'space-y-4 border-2 border-teal-500' : 'space-y-4 border-l-4 border-l-teal-500'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-900">{option.name}</h3>
            <MockDataBadge />
          </div>
          <p className="mt-1 text-sm text-neutral-700">
            {areaLabel(option.area)} - {option.roomType}
          </p>
        </div>
        <p className="text-lg font-semibold text-neutral-900">
          {formatCurrency(option.pricing.totalAmount, option.pricing.currency)}
          <span className="block text-xs font-medium text-neutral-600">
            {option.roomCount} room{option.roomCount === 1 ? '' : 's'}, {option.nights} night
            {option.nights === 1 ? '' : 's'}
          </span>
        </p>
      </div>

      <dl className="grid gap-3 text-sm text-neutral-700 sm:grid-cols-5">
        <div>
          <dt className="font-medium text-neutral-900">Nights</dt>
          <dd>{option.nights}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Nightly</dt>
          <dd>{formatCurrency(option.pricing.nightlyAmount, option.pricing.currency)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Room</dt>
          <dd>Up to {option.maxGuests} guests</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Breakfast</dt>
          <dd>{option.breakfastIncluded ? 'Included' : 'Not included'}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Cancellation</dt>
          <dd>{option.refundable ? 'Flexible sample' : 'Non-refundable sample'}</dd>
        </div>
      </dl>
      <p className="text-sm text-neutral-700">{option.cancellationSummary}</p>
      <MockDataNotice />
    </Card>
  )
}
