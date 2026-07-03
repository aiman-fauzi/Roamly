import type { Metadata } from 'next'

import { ProfileCard } from '@/components/features/profile/ProfileCard'

export const metadata: Metadata = { title: 'Profile' }

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Profile</h1>
        <p className="mt-2 text-neutral-700">Manage your travel defaults and account details.</p>
      </div>
      <ProfileCard />
    </div>
  )
}