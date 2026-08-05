import type {
  DestinationRetrievalResult,
  GeminiDestinationCandidateContext,
  GeminiDestinationContext,
  RankedDestinationCandidate,
} from '@/services/destinations/types'

const DEFAULT_MAX_CANDIDATES = 24
const DEFAULT_MAX_SERIALIZED_SIZE = 12_000
const DIVERSITY_SEED_TYPES: RankedDestinationCandidate['entityType'][] = [
  'ATTRACTION',
  'RESTAURANT',
  'ACTIVITY',
]

export interface GeminiContextOptions {
  maxCandidates?: number
  maxSerializedSize?: number
}

function summarize(candidate: RankedDestinationCandidate): string | undefined {
  const summary = candidate.enrichment?.shortSummary ?? candidate.description
  if (!summary) return undefined
  return summary.length > 240 ? `${summary.slice(0, 237).trim()}...` : summary
}

function toCandidateContext(
  candidate: RankedDestinationCandidate
): GeminiDestinationCandidateContext {
  const estimatedVisitDurationMinutes =
    candidate.enrichment?.estimatedVisitDurationMinutes ?? candidate.durationMinutes ?? undefined

  return {
    id: candidate.candidateId,
    type: candidate.entityType,
    name: candidate.name,
    summary: summarize(candidate),
    latitude: Number(candidate.latitude.toFixed(6)),
    longitude: Number(candidate.longitude.toFixed(6)),
    address: candidate.address ?? undefined,
    categories: candidate.categories.slice(0, 8),
    tags: [...new Set([...candidate.tags, ...(candidate.enrichment?.searchTags ?? [])])].slice(0, 12),
    openingHours: candidate.openingHours.length > 0 ? candidate.openingHours.slice(0, 14) : [],
    openingHoursStatus: candidate.openingHoursStatus,
    openingHoursKnown: candidate.openingHoursKnown,
    ticketPrice:
      candidate.ticketPrices.length === 0
        ? undefined
        : {
            ...candidate.ticketPrices[0],
            confidence: candidate.priceConfidence,
          },
    ticketPrices: candidate.ticketPrices,
    ticketPriceStatus: candidate.ticketPriceStatus,
    priceConfidence: candidate.priceConfidence,
    officialUrl: candidate.officialUrl ?? undefined,
    officialUrlStatus: candidate.officialUrlStatus,
    estimatedVisitDurationMinutes,
    source: candidate.source.toLowerCase(),
    lastVerifiedAt: candidate.lastVerifiedAt?.toISOString(),
    factualCompletenessScore: candidate.factualCompletenessScore,
    staleFactCount: candidate.staleFactCount,
    factualStatus: candidate.factualStatus,
    factSourceSummary: candidate.factSourceSummary,
    rankScore: candidate.rankScore,
    rankReasons: candidate.rankReasons.slice(0, 5),
    enrichmentState: candidate.enrichmentState,
  }
}

function serializedSize(value: unknown): number {
  return JSON.stringify(value).length
}

function selectedCandidateIds(candidates: GeminiDestinationCandidateContext[]): Set<string> {
  return new Set(candidates.map((candidate) => candidate.id))
}

function scopedClusters(
  result: DestinationRetrievalResult,
  candidates: GeminiDestinationCandidateContext[]
): DestinationRetrievalResult['clusters'] {
  const selectedIds = selectedCandidateIds(candidates)
  return result.clusters
    .map((cluster) => ({
      ...cluster,
      candidateIds: cluster.candidateIds.filter((id) => selectedIds.has(id)),
    }))
    .filter((cluster) => cluster.candidateIds.length > 0)
}

function scopedNearestNeighbors(
  result: DestinationRetrievalResult,
  candidates: GeminiDestinationCandidateContext[]
): DestinationRetrievalResult['nearestNeighbors'] {
  const selectedIds = selectedCandidateIds(candidates)
  return result.nearestNeighbors
    .filter((entry) => selectedIds.has(entry.candidateId))
    .map((entry) => ({
      candidateId: entry.candidateId,
      neighbors: entry.neighbors.filter((neighbor) => selectedIds.has(neighbor.candidateId)),
    }))
}

function orderCandidatesForContext(
  candidates: RankedDestinationCandidate[],
  maxCandidates: number
): RankedDestinationCandidate[] {
  if (maxCandidates < DIVERSITY_SEED_TYPES.length) return candidates.slice(0, maxCandidates)

  const selected: RankedDestinationCandidate[] = []
  const selectedIds = new Set<string>()

  for (const entityType of DIVERSITY_SEED_TYPES) {
    const candidate = candidates.find((item) => item.entityType === entityType)
    if (!candidate || selectedIds.has(candidate.candidateId)) continue
    selected.push(candidate)
    selectedIds.add(candidate.candidateId)
  }

  for (const candidate of candidates) {
    if (selected.length >= maxCandidates) break
    if (selectedIds.has(candidate.candidateId)) continue
    selected.push(candidate)
    selectedIds.add(candidate.candidateId)
  }

  return selected
}

export function buildGeminiDestinationContext(
  result: DestinationRetrievalResult,
  options: GeminiContextOptions = {}
): GeminiDestinationContext {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  const maxSerializedSize = options.maxSerializedSize ?? DEFAULT_MAX_SERIALIZED_SIZE
  const selected: GeminiDestinationCandidateContext[] = []
  const orderedCandidates = orderCandidatesForContext(result.candidates, maxCandidates)

  for (const candidate of orderedCandidates) {
    const next = [...selected, toCandidateContext(candidate)]
    const draft: GeminiDestinationContext = {
      cityId: result.cityId,
      candidates: next,
      clusters: scopedClusters(result, next),
      nearestNeighbors: scopedNearestNeighbors(result, next),
      candidateCount: next.length,
      omittedCandidateCount: Math.max(0, result.candidates.length - next.length),
      serializedSize: 0,
      maxSerializedSize,
    }
    const size = serializedSize(draft)
    if (size > maxSerializedSize && selected.length > 0) break
    if (size > maxSerializedSize) continue
    selected.push(next[next.length - 1])
  }

  const context: GeminiDestinationContext = {
    cityId: result.cityId,
    candidates: selected,
    clusters: scopedClusters(result, selected),
    nearestNeighbors: scopedNearestNeighbors(result, selected),
    candidateCount: selected.length,
    omittedCandidateCount: Math.max(0, result.candidates.length - selected.length),
    serializedSize: 0,
    maxSerializedSize,
  }
  context.serializedSize = serializedSize(context)

  return context
}
