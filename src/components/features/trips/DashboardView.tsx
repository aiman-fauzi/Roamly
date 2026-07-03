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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">My Trips</h1>
          <p className="mt-2 text-neutral-700">Drafts and generated itineraries stay here.</p>
        </div>
        <Link
          href={ROUTES.NEW_TRIP}
          className="inline-flex min-h-11 items-center justify-center rounded-card bg-primary-500 px-5 py-2.5 text-base font-semibold text-white shadow-card transition-ui hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          New trip
        </Link>
      </div>

      {error && !isLoading && (
        <div className="rounded-card bg-white p-5 shadow-card">
          <p role="alert" className="text-error-500">{error}</p>
          <Button className="mt-4" onClick={() => void refetch()} loadingLabel="Retrying...">Retry</Button>
        </div>
      )}

      {!error && isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-card bg-white p-4 text-sm font-medium text-neutral-700 shadow-card">
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
