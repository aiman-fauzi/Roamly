import type { DestinationFactKind, DestinationFactProvenance } from '@/services/destinations/facts/types'

export interface StaleThresholds {
  ticketPricesDays: number
  openingHoursDays: number
  addressCoordinatesDays: number
  descriptionTagsDays: number
}

export interface StaleDecision {
  stale: boolean
  ageDays: number
  thresholdDays: number
  reason: string
}

export const DEFAULT_STALE_THRESHOLDS: StaleThresholds = {
  ticketPricesDays: 30,
  openingHoursDays: 60,
  addressCoordinatesDays: 180,
  descriptionTagsDays: 365,
}

function thresholdFor(kind: DestinationFactKind, thresholds: StaleThresholds): number {
  if (kind === 'TICKET_PRICE') return thresholds.ticketPricesDays
  if (kind === 'OPENING_HOURS') return thresholds.openingHoursDays
  if (kind === 'ADDRESS' || kind === 'COORDINATES') return thresholds.addressCoordinatesDays
  return thresholds.descriptionTagsDays
}

export function evaluateFactStaleness(
  kind: DestinationFactKind,
  provenance: Pick<DestinationFactProvenance, 'verifiedAt' | 'retrievedAt'>,
  now: Date = new Date(),
  thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS
): StaleDecision {
  const timestamp = provenance.verifiedAt ?? provenance.retrievedAt
  const parsed = Date.parse(timestamp)
  const thresholdDays = thresholdFor(kind, thresholds)

  if (!Number.isFinite(parsed)) {
    return {
      stale: true,
      ageDays: Number.POSITIVE_INFINITY,
      thresholdDays,
      reason: 'Missing or invalid verification timestamp.',
    }
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
  return {
    stale: ageDays > thresholdDays,
    ageDays,
    thresholdDays,
    reason: ageDays > thresholdDays ? 'Fact exceeds stale-data threshold.' : 'Fact is within stale-data threshold.',
  }
}
