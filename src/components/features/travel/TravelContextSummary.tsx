import { FlightOptionCard } from './FlightOptionCard'
import { HotelOptionCard } from './HotelOptionCard'
import { MockDataNotice } from './MockDataBadge'
import { ArrivalDayNotice, DepartureDayNotice } from './TravelTimingNotice'
import { TripCostSummary } from './TripCostSummary'

import { Card } from '@/components/ui/Card'
import type { ItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'

interface TravelContextSummaryProps {
  context: ItineraryTravelContext
}

function areaLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' / ')
}

export function TravelContextSummary({ context }: TravelContextSummaryProps) {
  return (
    <section className="space-y-4" aria-label="Selected sample travel plan">
      <Card className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-atlas-700">Travel and stay</p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900">
              Selected sample logistics
            </h2>
          </div>
          <p className="text-sm font-medium text-neutral-700">
            {context.outboundFlight.originAirportCode} to{' '}
            {context.outboundFlight.destinationAirportCode} - {context.hotel.nights} nights
          </p>
        </div>
        <MockDataNotice />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlightOptionCard option={context.outboundFlight} title="Outbound flight" selected />
        <FlightOptionCard option={context.returnFlight} title="Return flight" selected />
      </div>

      <HotelOptionCard option={context.hotel} selected />

      <div className="grid gap-4 lg:grid-cols-2">
        <ArrivalDayNotice timing={context.timing} />
        <DepartureDayNotice timing={context.timing} />
      </div>

      <TripCostSummary costSummary={context.budget} />

      <Card className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Planning preview</h3>
          <span className="text-sm font-medium text-neutral-700">
            Hotel area: {areaLabel(context.hotelArea)}
          </span>
        </div>
        <div className="grid gap-3 text-sm text-neutral-700 md:grid-cols-3">
          <div>
            <p className="font-semibold text-neutral-900">Arrival day</p>
            <ul className="mt-2 space-y-1">
              {context.planningPreview.arrivalDayRecommendations.slice(0, 3).map((candidate) => (
                <li key={candidate.candidateId}>{candidate.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Full-day groups</p>
            <ul className="mt-2 space-y-1">
              {context.planningPreview.fullDayCandidateGroups.slice(0, 3).map((group) => (
                <li key={group.areaGroup}>
                  {areaLabel(group.areaGroup)} - {group.candidates.length}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-neutral-900">Final morning</p>
            <ul className="mt-2 space-y-1">
              {context.planningPreview.finalDayRecommendations.slice(0, 3).map((candidate) => (
                <li key={candidate.candidateId}>{candidate.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </section>
  )
}
