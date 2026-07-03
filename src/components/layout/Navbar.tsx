import Link from 'next/link'

import { LogoutButton } from '@/components/features/auth/LogoutButton'
import { ROUTES } from '@/constants/routes'

const links = [
  { href: ROUTES.DASHBOARD, label: 'Dashboard' },
  { href: ROUTES.PROFILE, label: 'Profile' },
]

export function Navbar() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2 text-xl font-bold text-neutral-900">
          <span aria-hidden="true">Roamly</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition-ui hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={ROUTES.NEW_TRIP}
            className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-card transition-ui hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            New trip
          </Link>
          <LogoutButton />
        </div>
      </nav>
    </header>
  )
}