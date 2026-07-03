'use client'

import { useCallback, useEffect, useState } from 'react'

import { API } from '@/constants/api'
import type { ApiErrorResponse } from '@/types/api'
import type { TripWithPreferences } from '@/types/trip'

interface UseTripsReturn {
  trips: TripWithPreferences[]
  isLoading: boolean
  error: string | null
  deleteTrip: (tripId: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useTrips(): UseTripsReturn {
  const [trips, setTrips] = useState<TripWithPreferences[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrips = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(API.TRIPS)
      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse
        setError(data.error ?? 'Failed to load trips.')
        setTrips([])
        return
      }

      const data = (await response.json()) as TripWithPreferences[]
      setTrips(data)
    } catch {
      setError('Network error. Please try again.')
      setTrips([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTrips()
  }, [fetchTrips])

  const deleteTrip = useCallback(
    async (tripId: string) => {
      const previousTrips = trips
      setTrips((current) => current.filter((trip) => trip.id !== tripId))
      setError(null)

      try {
        const response = await fetch(API.trip(tripId), { method: 'DELETE' })
        if (!response.ok) {
          const data = (await response.json()) as ApiErrorResponse
          throw new Error(data.error ?? 'Unable to delete trip.')
        }
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : 'Network error. Please try again.'
        setTrips(previousTrips)
        setError(message)
        throw new Error(message)
      }
    },
    [trips]
  )

  return {
    trips,
    isLoading,
    error,
    deleteTrip,
    refetch: fetchTrips,
  }
}
