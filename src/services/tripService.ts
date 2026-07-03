import { TripStatus } from '@prisma/client'

import { prisma } from '@/db/client'
import type { Trip, TripWithPreferences } from '@/types/trip'

export { TripStatus }

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

const DRAFT_TRIP_LIMIT = 10

/**
 * Create a new DRAFT trip for a user.
 * Enforces the 10-draft limit (Property 6, Req 7.3).
 */
export async function createTrip(userId: string): Promise<Trip> {
  const draftCount = await getDraftTripCount(userId)
  if (draftCount >= DRAFT_TRIP_LIMIT) {
    throw new ServiceError(
      'DRAFT_LIMIT_EXCEEDED',
      `You have reached the maximum of ${DRAFT_TRIP_LIMIT} draft trips. Please complete or delete an existing draft before creating a new one.`
    )
  }

  return prisma.trip.create({
    data: { userId, title: 'My New Trip', status: TripStatus.DRAFT },
  })
}

/** Count how many DRAFT trips a user currently has. */
export async function getDraftTripCount(userId: string): Promise<number> {
  return prisma.trip.count({ where: { userId, status: TripStatus.DRAFT } })
}

/**
 * Return all trips for a user, most recent first, including preferences.
 * Property 15: always sorted by createdAt descending.
 */
export async function getUserTrips(userId: string): Promise<TripWithPreferences[]> {
  return prisma.trip.findMany({
    where: { userId },
    include: { preferenceSet: true },
    orderBy: { createdAt: 'desc' },
  })
}

/** Fetch a single trip by ID, verifying ownership. Returns null if not found or not owned. */
export async function getTripById(
  tripId: string,
  userId: string
): Promise<TripWithPreferences | null> {
  return prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: { preferenceSet: true },
  })
}

/**
 * Delete a trip the user owns.
 * DB cascade deletes the PreferenceSet automatically.
 * Best-effort explicit PreferenceSet cleanup for logging (Req 7.6).
 * Property 7: unauthorized deletes throw FORBIDDEN.
 */
export async function deleteTrip(tripId: string, userId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) throw new ServiceError('NOT_FOUND', 'Trip not found.')
  if (trip.userId !== userId) throw new ServiceError('FORBIDDEN', 'You do not own this trip.')

  await prisma.trip.delete({ where: { id: tripId } })

  // Best-effort cleanup (cascade already handled by DB)
  try {
    await prisma.preferenceSet.deleteMany({ where: { tripId } })
  } catch (e) {
    console.warn('Best-effort PreferenceSet cleanup failed for trip', tripId, e)
  }
}

/**
 * Update a trip's status, optionally persisting the itinerary JSON.
 * Used by the AI generation route to mark a trip COMPLETE.
 */
export async function updateTripStatus(
  tripId: string,
  status: TripStatus,
  itineraryJson?: object
): Promise<Trip> {
  return prisma.trip.update({
    where: { id: tripId },
    data: {
      status,
      ...(itineraryJson !== undefined && { itineraryJson }),
    },
  })
}
