'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(ROUTES.HOME)
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      Sign out
    </Button>
  )
}
