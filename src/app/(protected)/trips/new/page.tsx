import type { Metadata } from 'next'

import { NewTripLauncher } from '@/components/features/trips/NewTripLauncher'

export const metadata: Metadata = {
  title: 'New Trip',
}

export default function NewTripPage() {
  return <NewTripLauncher />
}