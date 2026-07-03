import { TripCard } from './TripCard'

import { SkeletonCard } from '@/components/ui/Skeleton'
import type { TripWithPreferences } from '@/types/trip'


interface TripListProps {
  trips: TripWithPreferences[]
  isLoading?: boolean
  onDelete: (tripId: string) => Promise<void>
}

export function TripList({ trips, isLoading = false, onDelete }: TripListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onDelete={onDelete} />
      ))}
    </div>
  )
}