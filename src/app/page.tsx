import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

const sampleDays = [
  {
    day: '01',
    title: 'Old town arrival',
    detail: 'Check in, cafe stop, sunset walk',
    width: '78%',
  },
  {
    day: '02',
    title: 'Markets and museums',
    detail: 'Local breakfast, gallery route, night bites',
    width: '64%',
  },
  {
    day: '03',
    title: 'Coastline detour',
    detail: 'Train plan, lookout, seafood dinner',
    width: '86%',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-route-wash text-neutral-900">
      <section className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_520px] lg:px-8">
        <div className="absolute inset-x-4 top-6 flex items-center justify-between rounded-full border border-white/70 bg-white/60 px-4 py-3 shadow-card backdrop-blur-xl sm:inset-x-6 lg:inset-x-8">
          <Link href={ROUTES.HOME} className="text-lg font-bold tracking-tight text-neutral-900">
            Roamly
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.LOGIN}
              className="transition-ui rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-white hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.REGISTER}
              className="transition-ui rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-card hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              Start free
            </Link>
          </div>
        </div>

        <div className="pt-24 lg:pt-0">
          <p className="inline-flex rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm font-semibold text-primary-700 shadow-card backdrop-blur">
            AI travel planning for calmer decisions
          </p>
          <h1 className="mt-7 max-w-4xl text-balance text-5xl font-bold leading-[1.02] tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl">
            Plan Less. Explore More.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-700 sm:text-xl">
            Roamly turns your preferences into a structured trip workspace: drafts, itineraries,
            daily costs, and travel rhythm in one polished place.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ROUTES.REGISTER}
              className="transition-ui inline-flex min-h-12 items-center justify-center rounded-full bg-neutral-900 px-7 py-3 text-base font-semibold text-white shadow-card hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Create my first trip
            </Link>
            <Link
              href={ROUTES.LOGIN}
              className="transition-ui inline-flex min-h-12 items-center justify-center rounded-full border border-white/80 bg-white/70 px-7 py-3 text-base font-semibold text-neutral-900 shadow-card backdrop-blur hover:-translate-y-0.5 hover:bg-white hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Open dashboard
            </Link>
          </div>

          <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
            {[
              ['9', 'guided steps'],
              ['30s', 'AI target'],
              ['1', 'trip hub'],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-card border border-white/70 bg-white/50 p-4 shadow-card backdrop-blur"
              >
                <dt className="text-2xl font-bold text-neutral-900">{value}</dt>
                <dd className="mt-1 text-sm font-medium text-neutral-700">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative pb-10 pt-2 lg:pt-24">
          <div
            className="absolute -inset-6 rounded-[2rem] bg-atlas-grid bg-[length:28px_28px] opacity-70"
            aria-hidden="true"
          />
          <div className="surface-panel relative overflow-hidden p-5 sm:p-6">
            <div
              className="absolute right-6 top-6 h-24 w-24 rounded-full bg-atlas-100/70 blur-3xl"
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200/70 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">
                  Kyoto, Japan
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
                  5-day cultural escape
                </h2>
                <p className="mt-2 text-sm text-neutral-700">
                  Balanced pace, local food, rail-friendly route.
                </p>
              </div>
              <span className="rounded-full bg-atlas-50 px-3 py-1 text-xs font-bold uppercase text-atlas-700">
                Ready
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {sampleDays.map((item) => (
                <div
                  key={item.day}
                  className="rounded-card border border-neutral-200/80 bg-white/75 p-4 shadow-card backdrop-blur"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                      {item.day}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-900">{item.title}</p>
                      <p className="mt-1 text-sm text-neutral-700">{item.detail}</p>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-atlas-500"
                          style={{ width: item.width }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-card bg-neutral-900 p-4 text-white shadow-card">
                <p className="text-xs font-semibold uppercase text-white/60">Budget</p>
                <p className="mt-1 text-xl font-bold">$1,420</p>
              </div>
              <div className="rounded-card bg-sunrise-50 p-4 shadow-card">
                <p className="text-xs font-semibold uppercase text-sunrise-600">Route</p>
                <p className="mt-1 text-xl font-bold text-neutral-900">12 stops</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
