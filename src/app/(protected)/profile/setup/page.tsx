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
    <div className="mx-auto max-w-3xl">
      <ProfileForm mode="setup" />
    </div>
  )
}
