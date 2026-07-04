import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

export function EmptyTripState() {
  return (
    <div className="surface-panel overflow-hidden p-8 text-center sm:p-10">
      <div className="route-line mx-auto h-24 max-w-sm rounded-card bg-neutral-50" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="mx-auto -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 text-3xl font-semibold text-white shadow-card"
      >
        +
      </div>
      <h2 className="mt-5 text-heading text-neutral-900">No trips yet</h2>
      <p className="mx-auto mt-3 max-w-md text-neutral-700">
        Start planning your first adventure. Roamly will keep the questionnaire, itinerary, and costs together.
      </p>
      <Link
        href={ROUTES.NEW_TRIP}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-900 px-5 py-2.5 text-base font-semibold text-white shadow-card transition-ui hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      >
        Plan my first trip
      </Link>
    </div>
  )
}
