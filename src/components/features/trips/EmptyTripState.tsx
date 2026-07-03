import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

export function EmptyTripState() {
  return (
    <div className="rounded-card bg-white p-8 text-center shadow-card sm:p-10">
      <div
        aria-hidden="true"
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl text-primary-700"
      >
        +
      </div>
      <h2 className="mt-5 text-heading text-neutral-900">No trips yet</h2>
      <p className="mx-auto mt-3 max-w-md text-neutral-700">
        Start planning your first adventure. Roamly will keep the questionnaire, itinerary, and costs together.
      </p>
      <Link
        href={ROUTES.NEW_TRIP}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-card bg-primary-500 px-5 py-2.5 text-base font-semibold text-white shadow-card transition-ui hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      >
        Plan my first trip
      </Link>
    </div>
  )
}
