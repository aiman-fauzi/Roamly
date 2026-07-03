'use client'

import { ProfileForm } from '@/components/features/profile/ProfileForm'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useProfile } from '@/hooks/useProfile'
import { formatDate } from '@/utils/formatDate'

export function ProfileCard() {
  const { summary, isLoading, error } = useProfile()

  if (isLoading) return <SkeletonCard />

  if (error) {
    return (
      <div className="rounded-card bg-white p-card-pad shadow-card">
        <p role="alert" className="text-sm text-error-500">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {summary && (
        <section className="rounded-card bg-white p-card-pad shadow-card">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-neutral-700">Email</p>
              <p className="mt-1 break-words text-sm font-semibold text-neutral-900">
                {summary.email}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">Account created</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {formatDate(summary.accountCreatedAt)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">Trips</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">{summary.tripCount}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">Completed trips</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {summary.completedTripCount}
              </p>
            </div>
          </div>
        </section>
      )}

      <ProfileForm mode="edit" />
    </div>
  )
}