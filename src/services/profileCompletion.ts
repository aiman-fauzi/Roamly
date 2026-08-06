import { getOptionalAuthenticatedUser } from '@/lib/auth/serverAuth'
import { ensureProfile, getProfile, getProfileSummary } from '@/services/profileService'
import { ensureUser } from '@/services/userService'
import type { ProfileSummary } from '@/types/profile'

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function getCurrentProfileSummary(): Promise<ProfileSummary | null> {
  const user = await getOptionalAuthenticatedUser()
  if (!user) return null

  const metadata = user.user_metadata as Record<string, unknown>
  const displayName = metadataString(metadata, 'full_name') ?? metadataString(metadata, 'name')
  const avatarUrl = metadataString(metadata, 'avatar_url') ?? metadataString(metadata, 'picture')

  await ensureUser(user.id, user.email)
  if (!(await getProfile(user.id))) {
    await ensureProfile(user.id, displayName, avatarUrl, user.email)
  }

  return getProfileSummary(user.id)
}
