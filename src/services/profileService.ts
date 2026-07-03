import { TripStatus } from '@prisma/client'

import { prisma } from '@/db/client'
import { createClient } from '@/lib/supabase/server'
import {
  isProfileComplete,
  profileUpdateSchema,
  validateDisplayName,
  type ProfileSetupInput,
} from '@/lib/validations/profileValidation'
import type { Profile, ProfileSummary, ProfileUpdateInput } from '@/types/profile'
import { extractEmailPrefix } from '@/utils/emailUtils'

const AVATAR_BUCKET = 'avatars'

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  return prisma.profile.findUnique({ where: { userId } })
}

export async function ensureProfile(
  userId: string,
  displayName: string | null,
  avatarUrl: string | null,
  email?: string
): Promise<Profile> {
  const existing = await prisma.profile.findUnique({ where: { userId } })
  if (existing) return existing

  const name = displayName ?? (email ? extractEmailPrefix(email) : 'Traveller')

  return prisma.profile.create({
    data: {
      userId,
      displayName: name,
      avatarUrl,
      profileComplete: false,
    },
  })
}

export async function updateDisplayName(userId: string, displayName: string): Promise<Profile> {
  const validation = validateDisplayName(displayName)
  if (!validation.valid) {
    throw new ServiceError('INVALID_DISPLAY_NAME', validation.error ?? 'Invalid display name.')
  }

  const trimmed = displayName.trim()
  const existing = await prisma.profile.findUnique({ where: { userId } })

  return prisma.profile.update({
    where: { userId },
    data: {
      displayName: trimmed,
      profileComplete: isProfileComplete({
        displayName: trimmed,
        country: existing?.country,
        region: existing?.region,
        preferredCurrency: existing?.preferredCurrency,
      }),
    },
  })
}

export async function updateProfileDetails(
  userId: string,
  input: ProfileUpdateInput
): Promise<Profile> {
  const parsed: ProfileSetupInput = profileUpdateSchema.parse(input)
  const profileComplete = isProfileComplete(parsed)

  return prisma.profile.update({
    where: { userId },
    data: {
      displayName: parsed.displayName,
      country: parsed.country,
      region: parsed.region,
      preferredCurrency: parsed.preferredCurrency,
      travelInterests: parsed.travelInterests,
      preferredLanguage: parsed.preferredLanguage,
      profileComplete,
    },
  })
}

export async function getProfileSummary(userId: string): Promise<ProfileSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  })

  if (!user || !user.profile) {
    throw new ServiceError('PROFILE_NOT_FOUND', 'Profile not found.')
  }

  const [tripCount, completedTripCount] = await Promise.all([
    prisma.trip.count({ where: { userId } }),
    prisma.trip.count({ where: { userId, status: TripStatus.COMPLETE } }),
  ])

  return {
    profile: user.profile,
    email: user.email,
    accountCreatedAt: user.createdAt,
    tripCount,
    completedTripCount,
  }
}

export async function updateAvatar(userId: string, file: File): Promise<Profile> {
  const supabase = await createClient()
  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${userId}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    throw new ServiceError('UPLOAD_FAILED', `Avatar upload failed: ${uploadError.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath)

  try {
    return await prisma.profile.update({
      where: { userId },
      data: { avatarUrl: publicUrl },
    })
  } catch {
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([storagePath])
      .catch((error: unknown) => {
        console.warn('Avatar rollback failed - orphaned file at', storagePath, error)
      })

    throw new ServiceError('DB_UPDATE_FAILED', 'Failed to save avatar URL. Please try again.')
  }
}