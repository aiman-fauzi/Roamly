import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_480px] lg:px-8">
        <div>
          <div className="mb-6 text-2xl font-bold text-neutral-900">Roamly</div>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight text-neutral-900 sm:text-6xl">
            Plan Less. <span className="text-primary-600">Explore More.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-neutral-700">
            Build a personalized travel itinerary from a focused questionnaire, then keep every
            draft and completed trip in one tidy dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ROUTES.REGISTER}
              className="inline-flex min-h-11 items-center justify-center rounded-card bg-primary-500 px-6 py-3 text-base font-semibold text-white shadow-card transition-ui hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Get started
            </Link>
            <Link
              href={ROUTES.LOGIN}
              className="inline-flex min-h-11 items-center justify-center rounded-card border border-neutral-200 bg-white px-6 py-3 text-base font-semibold text-neutral-900 shadow-card transition-ui hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="rounded-card bg-white p-5 shadow-elevated">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-primary-700">Kyoto, Japan</p>
              <h2 className="text-xl font-semibold text-neutral-900">5-day cultural escape</h2>
            </div>
            <span className="rounded-full bg-success-500 px-3 py-1 text-xs font-bold uppercase text-white">
              Complete
            </span>
          </div>
          <div className="mt-5 space-y-4">
            {['Temple morning', 'Market lunch', 'Lantern walk'].map((item, index) => (
              <div key={item} className="rounded-card border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-neutral-700">Day {index + 1}</p>
                <p className="mt-1 font-semibold text-neutral-900">{item}</p>
                <div className="mt-3 h-2 rounded-full bg-neutral-100">
                  <div className="h-2 rounded-full bg-primary-500" style={{ width: `${70 - index * 12}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}