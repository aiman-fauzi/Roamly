import { NextResponse } from 'next/server'

import { ROUTES } from '@/constants/routes'
import { createClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/services/profileService'
import { ensureUser } from '@/services/userService'

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (!code) {
    const redirectUrl = new URL(ROUTES.LOGIN, origin)
    if (error) redirectUrl.searchParams.set('error', error)
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = await createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.session) {
    console.error('[auth/callback] exchangeCodeForSession error:', exchangeError?.message)
    const redirectUrl = new URL(ROUTES.LOGIN, origin)
    redirectUrl.searchParams.set('error', 'oauth_failed')
    return NextResponse.redirect(redirectUrl)
  }

  const { user } = data.session
  const metadata = user.user_metadata as Record<string, unknown>
  const displayName = metadataString(metadata, 'full_name') ?? metadataString(metadata, 'name')
  const avatarUrl = metadataString(metadata, 'avatar_url') ?? metadataString(metadata, 'picture')

  try {
    await ensureUser(user.id, user.email)
    await ensureProfile(user.id, displayName, avatarUrl, user.email)
  } catch (profileError) {
    console.warn('[auth/callback] profile seeding failed:', profileError)
  }

  return NextResponse.redirect(`${origin}${ROUTES.DASHBOARD}`)
}