import type { TripStatus } from '@prisma/client'

export type { TripStatus }

export interface Trip {
  id: string
  userId: string
  title: string
  status: TripStatus
  itineraryJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

export interface PreferenceSet {
  id: string
  tripId: string
  destination: string | null
  budget: number | null
  travelStyles: string[]
  foodPreferences: string[]
  accommodationType: string | null
  transportationPreference: string | null
  activityPreferences: string[]
  groupSize: number | null
  durationDays: number | null
  createdAt: Date
  updatedAt: Date
}

export interface TripWithPreferences extends Trip {
  preferenceSet: PreferenceSet | null
}

/** Input type for creating / upserting a PreferenceSet */
export interface PreferenceSetInput {
  destination: string
  budget: number
  durationDays: number
  groupSize: number
  travelStyles: string[]
  accommodationType: string | null
  transportationPreference: string | null
  foodPreferences: string[]
  activityPreferences: string[]
}