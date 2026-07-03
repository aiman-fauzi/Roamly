import type { Metadata } from 'next'

import { ItineraryView } from '@/components/features/itinerary/ItineraryView'

export const metadata: Metadata = {
  title: 'Your Itinerary',
}

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params
  return <ItineraryView tripId={tripId} />
}