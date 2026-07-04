import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-route-wash lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="hidden min-h-screen flex-col justify-between overflow-hidden border-r border-white/70 bg-white/40 p-10 backdrop-blur-xl lg:flex">
        <Link href={ROUTES.HOME} className="text-xl font-bold tracking-tight text-neutral-900">
          Roamly
        </Link>
        <div>
          <p className="inline-flex rounded-full bg-atlas-50 px-3 py-1 text-sm font-semibold text-atlas-700">
            Premium trip intelligence
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-bold leading-tight tracking-tight text-neutral-900">
            A calmer way to build trips you trust.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-neutral-700">
            Sign in to keep drafts, profile preferences, budgets, and AI itineraries together.
          </p>
        </div>
        <div className="surface-panel p-5">
          <div className="route-line h-24 rounded-card bg-neutral-50" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-neutral-700">
            Your saved questionnaire answers stay with each trip, so planning can pause and resume naturally.
          </p>
        </div>
      </aside>
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
        <Link href={ROUTES.HOME} className="mb-8 text-2xl font-bold tracking-tight text-neutral-900 lg:hidden">
          Roamly
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
