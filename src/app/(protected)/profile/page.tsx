import type { Metadata } from 'next'

import { ProfileCard } from '@/components/features/profile/ProfileCard'

export const metadata: Metadata = { title: 'Profile' }

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="surface-panel p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">Account preferences</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-neutral-900">Profile</h1>
        <p className="mt-3 max-w-2xl text-neutral-700">
          Manage the travel defaults Roamly uses for currency, language, profile details, and itinerary personalization.
        </p>
      </section>
      <ProfileCard />
    </div>
  )
}
