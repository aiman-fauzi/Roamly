import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'

interface SidebarProps {
  className?: string
}

const links = [
  { href: ROUTES.DASHBOARD, label: 'Dashboard' },
  { href: ROUTES.PROFILE, label: 'Profile' },
  { href: ROUTES.NEW_TRIP, label: 'New trip' },
]

export function Sidebar({ className }: SidebarProps) {
  return (
    <aside className={cn('rounded-card bg-white p-card-pad shadow-card', className)}>
      <nav aria-label="Secondary navigation" className="grid gap-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition-ui hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}