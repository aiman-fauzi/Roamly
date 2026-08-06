import { slugify } from '@/import/normalization'
import type {
  DuplicateDiagnostic,
  DuplicateDecision,
  ExistingDestinationForDeduplication,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'
import { candidateNameIdentityKeys, distanceMeters, normalizeNameIdentityKeys } from '@/services/destinations/importPipeline/utils'

export interface DuplicateEvaluation {
  decision: DuplicateDecision
  confidence: number
  duplicateOf?: string
  diagnostic?: DuplicateDiagnostic
}

function candidateLabel(candidate: NormalizedDestinationCandidate): string {
  return `${candidate.sourceId}:${candidate.sourceRecordId}`
}

function existingLabel(existing: ExistingDestinationForDeduplication): string {
  return `${existing.entityType}:${existing.entityId}`
}

function sameName(candidate: NormalizedDestinationCandidate, existing: ExistingDestinationForDeduplication): boolean {
  const candidateKeys = new Set(candidateNameIdentityKeys(candidate))
  const existingKeys = existing.nameIdentityKeys?.length
    ? existing.nameIdentityKeys
    : normalizeNameIdentityKeys([existing.name, existing.slug])
  const normalizedMatches = existingKeys.some((key) => candidateKeys.has(key))
  return normalizedMatches || slugify(candidate.name) === existing.slug
}

function aliasOverlap(candidate: NormalizedDestinationCandidate, existing: ExistingDestinationForDeduplication): boolean {
  const candidateKeys = new Set(candidateNameIdentityKeys(candidate))
  const existingKeys = existing.nameIdentityKeys?.length
    ? existing.nameIdentityKeys
    : normalizeNameIdentityKeys([existing.name, existing.slug])
  return existingKeys.some((existingKey) => candidateKeys.has(existingKey))
}

function coordinates(existing: ExistingDestinationForDeduplication): { latitude: number; longitude: number } | null {
  return existing.latitude == null || existing.longitude == null
    ? null
    : { latitude: existing.latitude, longitude: existing.longitude }
}

export function evaluateDuplicateCandidate(
  candidate: NormalizedDestinationCandidate,
  previousCandidates: NormalizedDestinationCandidate[],
  existingDestinations: ExistingDestinationForDeduplication[]
): DuplicateEvaluation {
  const diagnostic = (
    decision: DuplicateDecision,
    confidence: number,
    match: {
      duplicateOf?: string
      matchedSourceRecordId?: string | null
      matchedEntityId?: string | null
      matchedName?: string | null
      matchedFields: string[]
      distanceMeters?: number | null
    }
  ): DuplicateEvaluation => ({
    decision,
    confidence,
    duplicateOf: match.duplicateOf,
    diagnostic: {
      candidateSourceRecordId: candidate.sourceRecordId,
      candidateName: candidate.name,
      matchedSourceRecordId: match.matchedSourceRecordId ?? null,
      matchedEntityId: match.matchedEntityId ?? null,
      matchedName: match.matchedName ?? null,
      matchedFields: match.matchedFields,
      geographicDistanceMeters:
        match.distanceMeters == null ? null : Number(match.distanceMeters.toFixed(1)),
      confidenceScore: confidence,
      decision,
      mergeTarget: match.duplicateOf ?? null,
    },
  })

  for (const previous of previousCandidates) {
    if (previous.sourceId === candidate.sourceId && previous.sourceRecordId === candidate.sourceRecordId) {
      return diagnostic('exact_duplicate', 100, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['sourceRecordId'],
      })
    }
    const meters = distanceMeters(candidate, previous)
    const candidateKeys = new Set(candidateNameIdentityKeys(candidate))
    const previousKeys = candidateNameIdentityKeys(previous)
    const comparableName = previousKeys.some((key) => candidateKeys.has(key))
    const sameWikidata = Boolean(candidate.wikidataId && previous.wikidataId && candidate.wikidataId === previous.wikidataId)
    const sameWebsite = Boolean(candidate.websiteUrl && previous.websiteUrl && candidate.websiteUrl === previous.websiteUrl)
    if (sameWikidata) {
      return diagnostic('probable_duplicate', 96, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['wikidataId'],
        distanceMeters: meters,
      })
    }
    if (sameWebsite) {
      return diagnostic('probable_duplicate', 90, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['websiteUrl'],
        distanceMeters: meters,
      })
    }
    if (comparableName && meters <= 150) {
      return diagnostic('probable_duplicate', 92, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['name', 'coordinates'],
        distanceMeters: meters,
      })
    }
    if (meters <= 250 && candidate.aliases.some((alias) => previous.aliases.includes(alias))) {
      return diagnostic('probable_duplicate', 88, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['alias', 'coordinates'],
        distanceMeters: meters,
      })
    }
    if (comparableName && meters > 1000) {
      return diagnostic('conflict', 72, {
        duplicateOf: candidateLabel(previous),
        matchedSourceRecordId: previous.sourceRecordId,
        matchedName: previous.name,
        matchedFields: ['name', 'distant_coordinates'],
        distanceMeters: meters,
      })
    }
  }

  for (const existing of existingDestinations) {
    if (existing.sourceRecordIds?.includes(candidate.sourceRecordId)) {
      return diagnostic('exact_duplicate', 100, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: candidate.sourceRecordId,
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['sourceRecordId'],
      })
    }
    const existingCoordinate = coordinates(existing)
    if (!existingCoordinate) continue
    const meters = distanceMeters(candidate, existingCoordinate)
    const sameWikidata = Boolean(candidate.wikidataId && existing.wikidataIds?.includes(candidate.wikidataId))
    const sameWebsite = Boolean(candidate.websiteUrl && existing.websiteUrl && candidate.websiteUrl === existing.websiteUrl)
    if (sameWikidata) {
      return diagnostic('probable_duplicate', 96, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['wikidataId'],
        distanceMeters: meters,
      })
    }
    if (sameWebsite) {
      return diagnostic('probable_duplicate', 90, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['websiteUrl'],
        distanceMeters: meters,
      })
    }
    if (sameName(candidate, existing) && meters <= 150) {
      return diagnostic('probable_duplicate', 90, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['name', 'coordinates'],
        distanceMeters: meters,
      })
    }
    if (aliasOverlap(candidate, existing) && meters <= 250) {
      return diagnostic('probable_duplicate', 84, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['alias', 'coordinates'],
        distanceMeters: meters,
      })
    }
    if (sameName(candidate, existing) && meters <= 500) {
      return diagnostic('possible_duplicate', 70, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['name', 'nearby_coordinates'],
        distanceMeters: meters,
      })
    }
    if (sameName(candidate, existing) && meters > 1000) {
      return diagnostic('conflict', 65, {
        duplicateOf: existingLabel(existing),
        matchedSourceRecordId: existing.sourceRecordIds?.[0],
        matchedEntityId: existing.entityId,
        matchedName: existing.name,
        matchedFields: ['name', 'distant_coordinates'],
        distanceMeters: meters,
      })
    }
  }

  return { decision: 'new', confidence: 0 }
}
