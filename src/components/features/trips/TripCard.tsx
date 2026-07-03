'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ROUTES } from '@/constants/routes'
import type { TripWithPreferences } from '@/types/trip'
import { formatCurrency } from '@/utils/formatCurrency'
import { formatDate } from '@/utils/formatDate'

interface TripCardProps {
  trip: TripWithPreferences
  onDelete: (tripId: string) => Promise<void>
}

function progressForTrip(trip: TripWithPreferences) {
  if (trip.status === 'COMPLETE') return 100
  if (trip.preferenceSet) return 65
  return 25
}

function progressLabel(trip: TripWithPreferences) {
  if (trip.status === 'COMPLETE') return 'Itinerary ready'
  if (trip.preferenceSet) return 'Preferences saved'
  return 'Questionnaire started'
}

export function TripCard({ trip, onDelete }: TripCardProps) {
  const toast = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const destination = trip.preferenceSet?.destination ?? 'Destination pending'
  const duration = trip.preferenceSet?.durationDays ? `${trip.preferenceSet.durationDays} days` : 'Not set'
  const budget = trip.preferenceSet?.budget ? formatCurrency(trip.preferenceSet.budget) : 'Not set'
  const href =
    trip.status === 'COMPLETE' ? ROUTES.tripItinerary(trip.id) : ROUTES.tripQuestionnaire(trip.id)
  const progress = progressForTrip(trip)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await onDelete(trip.id)
      toast.success('Deleted successfully.', `${trip.title} was removed.`)
      setShowConfirm(false)
    } catch (deleteError) {
      toast.error(
        'Unable to delete trip.',
        deleteError instanceof Error ? deleteError.message : 'Please try again.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <article className="rounded-card bg-white shadow-card transition-ui hover:-translate-y-0.5 hover:shadow-card-hover focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2">
      <div className="flex flex-col gap-4 p-card-pad sm:flex-row sm:items-start sm:justify-between">
        <Link href={href} className="min-w-0 flex-1 rounded-md focus-visible:outline-none">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-xl font-semibold text-neutral-900">{destination}</h2>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold uppercase text-primary-700">
              {trip.status === 'COMPLETE' ? 'Complete' : 'Draft'}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-neutral-700">{trip.title}</p>

          <dl className="mt-4 grid gap-3 text-sm text-neutral-700 sm:grid-cols-4">
            <div>
              <dt className="font-medium text-neutral-900">Budget</dt>
              <dd>{budget}</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-900">Duration</dt>
              <dd>{duration}</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-900">Last updated</dt>
              <dd>{formatDate(trip.updatedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-900">Progress</dt>
              <dd>{progressLabel(trip)}</dd>
            </div>
          </dl>

          <div className="mt-4" aria-label={`Trip progress ${progress}%`}>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-primary-500 transition-ui" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowConfirm(true)}
          className="self-start"
          aria-label={`Delete ${trip.title}`}
        >
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Delete this trip?"
        description="This action cannot be undone. The trip, saved preferences, and generated itinerary will be removed."
        confirmLabel="Delete trip"
        isConfirming={isDeleting}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void handleDelete()}
      />
    </article>
  )
}

