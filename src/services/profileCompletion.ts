import { createClient } from '@/lib/supabase/server'
import { ensureProfile, getProfile, getProfileSummary } from '@/services/profileService'
import { ensureUser } from '@/services/userService'
import type { ProfileSummary } from '@/types/profile'

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function getCurrentProfileSummary(): Promise<ProfileSummary | null> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return null

  const metadata = session.user.user_metadata as Record<string, unknown>
  const displayName = metadataString(metadata, 'full_name') ?? metadataString(metadata, 'name')
  const avatarUrl = metadataString(metadata, 'avatar_url') ?? metadataString(metadata, 'picture')

  await ensureUser(session.user.id, session.user.email)
  if (!(await getProfile(session.user.id))) {
    await ensureProfile(session.user.id, displayName, avatarUrl, session.user.email)
  }

  return getProfileSummary(session.user.id)
}
