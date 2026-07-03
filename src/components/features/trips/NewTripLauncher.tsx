'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { API } from '@/constants/api'
import { ROUTES } from '@/constants/routes'
import type { ApiErrorResponse } from '@/types/api'
import type { Trip } from '@/types/trip'

const workspaceSteps = ['Creating draft', 'Opening questionnaire', 'Saving workspace']

export function NewTripLauncher() {
  const router = useRouter()
  const toast = useToast()
  const hasAutoStartedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(true)

  const createTrip = useCallback(async () => {
    setError(null)
    setIsCreating(true)
    try {
      const response = await fetch(API.TRIPS, { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse
        const message = data.error ?? 'Failed to create trip.'
        setError(message)
        toast.error('Unable to create trip.', 'Please try again.')
        return
      }

      const trip = (await response.json()) as Trip
      toast.success('Trip created.', 'Your travel workspace is ready.')
      router.replace(ROUTES.tripQuestionnaire(trip.id))
    } catch {
      setError('Network error. Please try again.')
      toast.error('Unable to create trip.', 'Please check your connection and try again.')
    } finally {
      setIsCreating(false)
    }
  }, [router, toast])

  useEffect(() => {
    if (hasAutoStartedRef.current) return
    hasAutoStartedRef.current = true
    void createTrip()
  }, [createTrip])

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center text-center">
      {isCreating && (
        <div className="w-full rounded-card bg-white p-8 shadow-card">
          <div className="flex flex-col items-center gap-4">
            <Spinner />
            <div>
              <h1 className="text-heading text-neutral-900">Preparing your travel workspace...</h1>
              <p className="mt-2 text-neutral-700">A fresh trip draft is opening now.</p>
            </div>
          </div>
          <ul className="mt-6 space-y-2 text-left text-sm text-neutral-700" aria-label="Workspace preparation steps">
            {workspaceSteps.map((step) => (
              <li key={step} className="flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-2">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary-500" />
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && !isCreating && (
        <div className="rounded-card bg-white p-8 shadow-card">
          <h1 className="text-heading text-neutral-900">Trip could not be created</h1>
          <p role="alert" className="mt-3 text-neutral-700">
            {error}
          </p>
          <Button className="mt-6" onClick={createTrip} loadingLabel="Retrying...">
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
