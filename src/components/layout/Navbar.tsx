import Link from 'next/link'

import { LogoutButton } from '@/components/features/auth/LogoutButton'
import { ROUTES } from '@/constants/routes'

const links = [
  { href: ROUTES.DASHBOARD, label: 'Dashboard' },
  { href: ROUTES.PROFILE, label: 'Profile' },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-neutral-50/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link
          href={ROUTES.DASHBOARD}
          className="flex items-center gap-3 text-xl font-bold tracking-tight text-neutral-900"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm text-white shadow-card"
            aria-hidden="true"
          >
            R
          </span>
          <span>Roamly</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-ui rounded-full px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-white/80 hover:text-neutral-900 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={ROUTES.NEW_TRIP}
            className="transition-ui rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-card hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            New trip
          </Link>
          <LogoutButton />
        </div>
      </nav>
    </header>
  )
}
