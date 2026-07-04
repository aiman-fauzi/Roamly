'use client'

import Link from 'next/link'

import { EmptyTripState } from '@/components/features/trips/EmptyTripState'
import { TripList } from '@/components/features/trips/TripList'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ROUTES } from '@/constants/routes'
import { useTrips } from '@/hooks/useTrips'

export function DashboardView() {
  const { trips, isLoading, error, deleteTrip, refetch } = useTrips()
  const completeTrips = trips.filter((trip) => trip.status === 'COMPLETE').length

  return (
    <div className="space-y-7">
      <section className="surface-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">Travel workspace</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">My Trips</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-700">
              Drafts, generated itineraries, budget context, and trip history stay organized here.
            </p>
          </div>
          <Link
            href={ROUTES.NEW_TRIP}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-neutral-900 px-6 py-3 text-base font-semibold text-white shadow-card transition-ui hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            New trip
          </Link>
        </div>

        <dl className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="surface-subtle p-4">
            <dt className="text-sm font-semibold text-neutral-700">Total trips</dt>
            <dd className="mt-1 text-3xl font-bold text-neutral-900">{trips.length}</dd>
          </div>
          <div className="surface-subtle p-4">
            <dt className="text-sm font-semibold text-neutral-700">Ready itineraries</dt>
            <dd className="mt-1 text-3xl font-bold text-neutral-900">{completeTrips}</dd>
          </div>
          <div className="surface-subtle p-4">
            <dt className="text-sm font-semibold text-neutral-700">Drafts</dt>
            <dd className="mt-1 text-3xl font-bold text-neutral-900">{Math.max(trips.length - completeTrips, 0)}</dd>
          </div>
        </dl>
      </section>

      {error && !isLoading && (
        <div className="surface-panel p-5">
          <p role="alert" className="font-medium text-error-500">{error}</p>
          <Button className="mt-4" onClick={() => void refetch()} loadingLabel="Retrying...">Retry</Button>
        </div>
      )}

      {!error && isLoading && (
        <div className="space-y-4">
          <div className="surface-panel flex items-center gap-3 p-4 text-sm font-semibold text-neutral-700">
            <Spinner size="sm" />
            Loading your travel workspace...
          </div>
          <TripList trips={[]} isLoading onDelete={deleteTrip} />
        </div>
      )}
      {!error && !isLoading && trips.length === 0 && <EmptyTripState />}
      {!error && !isLoading && trips.length > 0 && (
        <TripList trips={trips} onDelete={deleteTrip} />
      )}
    </div>
  )
}
