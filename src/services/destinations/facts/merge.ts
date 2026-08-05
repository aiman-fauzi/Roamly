import type { DestinationFactProvenance, FactSourceTier } from '@/services/destinations/facts/types'

const SOURCE_PRIORITY: Record<FactSourceTier, number> = {
  OFFICIAL_SOURCE: 5,
  GOVERNMENT_OPEN_DATA: 4,
  OPENSTREETMAP_STRUCTURED: 3,
  TRUSTED_TRAVEL_LISTING: 2,
  GEMINI_DERIVED: 1,
}

export interface MergeableFact<T> {
  value: T
  provenance: DestinationFactProvenance
}

export interface FactMergeResult<T> {
  accepted: MergeableFact<T>
  conflicts: Array<{
    rejected: MergeableFact<T>
    reason: string
  }>
}

function verifiedAt(fact: MergeableFact<unknown>): number {
  const value = fact.provenance.verifiedAt ?? fact.provenance.retrievedAt
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function priority(fact: MergeableFact<unknown>): number {
  return SOURCE_PRIORITY[fact.provenance.sourceTier]
}

export function mergeFactsByPrecedence<T>(facts: Array<MergeableFact<T>>): FactMergeResult<T> | null {
  if (facts.length === 0) return null

  const sorted = [...facts].sort((first, second) => {
    const priorityDelta = priority(second) - priority(first)
    if (priorityDelta !== 0) return priorityDelta
    return verifiedAt(second) - verifiedAt(first)
  })
  const accepted = sorted[0]

  return {
    accepted,
    conflicts: sorted.slice(1).map((rejected) => ({
      rejected,
      reason:
        priority(rejected) < priority(accepted)
          ? 'Lower-confidence source tier.'
          : 'Older verified timestamp at the same source tier.',
    })),
  }
}
