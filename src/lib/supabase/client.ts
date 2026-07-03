import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 * Used in Client Components ('use client') for auth actions and storage operations.
 *
 * Creates a new instance each call — this is safe because @supabase/ssr
 * uses cookie-based session management rather than in-memory state.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

