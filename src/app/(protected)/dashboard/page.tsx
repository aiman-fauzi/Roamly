import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { DashboardView } from '@/components/features/trips/DashboardView'
import { ROUTES } from '@/constants/routes'
import { getCurrentProfileSummary } from '@/services/profileCompletion'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function DashboardPage() {
  const summary = await getCurrentProfileSummary()
  if (!summary) redirect(ROUTES.LOGIN)
  if (!summary.profile.profileComplete) redirect(ROUTES.PROFILE_SETUP)

  return <DashboardView />
}