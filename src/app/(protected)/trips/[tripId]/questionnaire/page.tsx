import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { QuestionnaireShell } from '@/components/features/questionnaire/QuestionnaireShell'
import { ROUTES } from '@/constants/routes'
import { createClient } from '@/lib/supabase/server'
import { getTripById } from '@/services/tripService'
import { ensureUser } from '@/services/userService'

export const metadata: Metadata = {
  title: 'Plan Your Trip',
}

function TripUnavailable() {
  return (
    <div className="mx-auto max-w-xl rounded-card bg-white p-8 text-center shadow-card">
      <div
        aria-hidden="true"
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-xl font-bold text-primary-700"
      >
        ?
      </div>
      <h1 className="mt-5 text-heading text-neutral-900">Trip unavailable</h1>
      <p className="mt-3 text-neutral-700">
        This trip could not be opened from the current session. It may have been deleted, or it may belong to another account.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href={ROUTES.DASHBOARD}
          className="inline-flex min-h-11 items-center justify-center rounded-card bg-primary-500 px-5 py-2.5 text-base font-semibold text-white shadow-card transition-ui hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Back to dashboard
        </Link>
        <Link
          href={ROUTES.NEW_TRIP}
          className="inline-flex min-h-11 items-center justify-center rounded-card border border-neutral-200 bg-white px-5 py-2.5 text-base font-semibold text-neutral-900 shadow-card transition-ui hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Start a new trip
        </Link>
      </div>
    </div>
  )
}

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.tripQuestionnaire(tripId))}`)
  }

  await ensureUser(session.user.id, session.user.email)
  const trip = await getTripById(tripId, session.user.id)
  if (!trip) return <TripUnavailable />

  return <QuestionnaireShell tripId={tripId} />
}
