'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { DayCard } from '@/components/features/itinerary/DayCard'
import { ItineraryHeader } from '@/components/features/itinerary/ItineraryHeader'
import { ItineraryTimeline } from '@/components/features/itinerary/ItineraryTimeline'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { API } from '@/constants/api'
import { ROUTES } from '@/constants/routes'
import type { ApiErrorResponse } from '@/types/api'
import type { Itinerary } from '@/types/itinerary'
import type { TripWithPreferences } from '@/types/trip'

interface ItineraryViewProps {
  tripId: string
}

const loadingSteps = ['Loading trip details', 'Checking itinerary status', 'Preparing timeline']

function isRichItinerary(value: unknown): value is Itinerary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Itinerary>
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.currencyLocal === 'string' &&
    typeof candidate.currencyUser === 'string' &&
    Boolean(candidate.exchangeRate) &&
    Boolean(candidate.budget) &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.roadmap)
  )
}

function isLegacyItinerary(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { title?: unknown; summary?: unknown; days?: unknown }
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.days)
  )
}

export function ItineraryView({ tripId }: ItineraryViewProps) {
  const router = useRouter()
  const [trip, setTrip] = useState<TripWithPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchTrip = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(API.trip(tripId))
      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse
        setError(data.error ?? 'Failed to load itinerary.')
        return
      }

      const data = (await response.json()) as TripWithPreferences
      if (data.status === 'DRAFT') {
        router.replace(ROUTES.tripQuestionnaire(tripId))
        return
      }

      setTrip(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [router, tripId])

  useEffect(() => {
    void fetchTrip()
  }, [fetchTrip])

  const itinerary = trip && isRichItinerary(trip.itineraryJson) ? trip.itineraryJson : null
  const hasLegacyItinerary = trip && !itinerary && isLegacyItinerary(trip.itineraryJson)

  if (isLoading) {
    return (
      <div className="surface-panel mx-auto max-w-3xl p-6" aria-live="polite">
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <h1 className="text-heading text-neutral-900">Opening your itinerary...</h1>
            <p className="mt-1 text-sm text-neutral-700">Getting the latest trip details.</p>
          </div>
        </div>
        <ul className="mt-6 grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
          {loadingSteps.map((step) => (
            <li key={step} className="rounded-md bg-neutral-50 px-3 py-2">
              {step}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (error) {
    return (
      <div className="surface-panel p-6">
        <h1 className="text-heading text-neutral-900">Itinerary unavailable</h1>
        <p role="alert" className="mt-3 text-neutral-700">
          {error}
        </p>
        <Button className="mt-6" onClick={fetchTrip} loadingLabel="Retrying...">
          Retry
        </Button>
      </div>
    )
  }

  if (hasLegacyItinerary) {
    return (
      <div className="surface-panel p-6">
        <p className="text-sm font-semibold uppercase text-atlas-700">Update available</p>
        <h1 className="mt-2 text-heading text-neutral-900">Regenerate this itinerary</h1>
        <p className="mt-3 text-neutral-700">
          This itinerary was generated with an older format. Regenerate it to see the timeline,
          daily totals, and currency conversion.
        </p>
        <Button className="mt-6" onClick={() => router.push(ROUTES.tripQuestionnaire(tripId))}>
          Return to questionnaire
        </Button>
      </div>
    )
  }

  if (!itinerary) {
    return (
      <div className="surface-panel p-8 text-center sm:p-10">
        <div
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-atlas-50 text-2xl font-bold text-atlas-700"
        >
          AI
        </div>
        <h1 className="mt-5 text-heading text-neutral-900">No itinerary yet</h1>
        <p className="mx-auto mt-3 max-w-md text-neutral-700">
          Finish the questionnaire and Roamly will generate a timeline, costs, transport notes, and
          budget summary.
        </p>
        <Button className="mt-6" onClick={() => router.push(ROUTES.tripQuestionnaire(tripId))}>
          Continue questionnaire
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <ItineraryHeader itinerary={itinerary} destination={trip?.preferenceSet?.destination} />
      <ItineraryTimeline roadmap={itinerary.roadmap} />
      <div className="space-y-5">
        {itinerary.days.map((day) => (
          <DayCard key={day.dayNumber} day={day} />
        ))}
      </div>
    </div>
  )
}
