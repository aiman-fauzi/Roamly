import { prisma } from '@/db/client'
import type { PreferenceSet, PreferenceSetInput } from '@/types/trip'

/**
 * Upsert a PreferenceSet for a given trip.
 * If one already exists, it is updated; otherwise created.
 */
export async function upsertPreferenceSet(
  tripId: string,
  data: PreferenceSetInput
): Promise<PreferenceSet> {
  return prisma.preferenceSet.upsert({
    where: { tripId },
    update: {
      destination: data.destination,
      budget: data.budget,
      durationDays: data.durationDays,
      groupSize: data.groupSize,
      travelStyles: data.travelStyles,
      accommodationType: data.accommodationType,
      transportationPreference: data.transportationPreference,
      foodPreferences: data.foodPreferences,
      activityPreferences: data.activityPreferences,
    },
    create: {
      tripId,
      destination: data.destination,
      budget: data.budget,
      durationDays: data.durationDays,
      groupSize: data.groupSize,
      travelStyles: data.travelStyles,
      accommodationType: data.accommodationType,
      transportationPreference: data.transportationPreference,
      foodPreferences: data.foodPreferences,
      activityPreferences: data.activityPreferences,
    },
  })
}

/** Fetch the PreferenceSet for a given trip. */
export async function getPreferenceSet(tripId: string): Promise<PreferenceSet | null> {
  return prisma.preferenceSet.findUnique({ where: { tripId } })
}