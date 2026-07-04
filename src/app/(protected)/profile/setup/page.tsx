import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ProfileForm } from '@/components/features/profile/ProfileForm'
import { ROUTES } from '@/constants/routes'
import { getCurrentProfileSummary } from '@/services/profileCompletion'

export const metadata: Metadata = {
  title: 'Complete Profile',
}

export default async function ProfileSetupPage() {
  const summary = await getCurrentProfileSummary()
  if (!summary) redirect(ROUTES.LOGIN)
  if (summary.profile.profileComplete) redirect(ROUTES.DASHBOARD)

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <section className="surface-panel p-6 sm:p-8 lg:sticky lg:top-28">
        <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">First-time setup</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">Make every itinerary feel local.</h1>
        <p className="mt-4 leading-7 text-neutral-700">
          Add your location, preferred currency, and travel interests once. Roamly uses them to shape budgets and recommendations.
        </p>
        <div className="route-line mt-8 h-32 rounded-card bg-neutral-50" aria-hidden="true" />
      </section>
      <ProfileForm mode="setup" />
    </div>
  )
}
