import { cn } from '@/utils/cn'

interface SkeletonProps {
  className?: string
}

/**
 * Animated skeleton placeholder.
 * Property 17: shown ONLY when isLoading===true, not during errors or sync loads.
 * The parent is responsible for conditional rendering.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-neutral-200', className)}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-card bg-white p-card-pad shadow-card" aria-hidden="true">
      <Skeleton className="mb-3 h-5 w-2/3" />
      <Skeleton className="mb-2 h-4 w-1/3" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  )
}
