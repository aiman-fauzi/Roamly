import Link from 'next/link'

import { ROUTES } from '@/constants/routes'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-12">
      <Link href={ROUTES.HOME} className="mb-6 text-2xl font-bold text-neutral-900">
        Roamly
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}