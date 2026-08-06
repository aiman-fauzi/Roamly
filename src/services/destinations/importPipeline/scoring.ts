import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import type {
  DuplicateDecision,
  DestinationImportQualityScores,
  DestinationImportReadiness,
  ImportValidationReason,
  ImportValidationStatus,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'
import {
  hasStrongIdentitySignal,
  isCoordinateInsideArea,
  normalizeCandidateName,
  strongIdentitySignals,
  transportOnlyAssessment,
  validCoordinate,
} from '@/services/destinations/importPipeline/utils'

function statusFor(score: number, reasons: ImportValidationReason[]): ImportValidationStatus {
  if (
    reasons.some((reason) =>
      [
        'MISSING_NAME',
        'MISSING_SOURCE_RECORD_ID',
        'MISSING_COORDINATES',
        'INVALID_COORDINATES',
        'OUT_OF_BOUNDS',
        'UNSUPPORTED_CATEGORY',
        'GENERIC_NAME',
        'CHAIN_OR_GENERIC_BUSINESS',
        'TRANSPORT_ONLY',
        'SOURCE_DISABLED',
        'SOURCE_LICENSE_MISSING',
        'SOURCE_COMMERCIAL_REUSE_DISALLOWED',
      ].includes(reason)
    )
  ) {
    return 'rejected'
  }
  if (reasons.includes('LOW_IDENTITY_SIGNAL')) return score >= 55 ? 'review' : 'rejected'
  if (score >= 80) return 'accepted'
  if (score >= 55) return 'review'
  return 'rejected'
}

function duplicatePenalty(decision: DuplicateDecision): number {
  if (decision === 'exact_duplicate') return 100
  if (decision === 'probable_duplicate') return 35
  if (decision === 'possible_duplicate') return 15
  if (decision === 'conflict') return 45
  return 0
}

export function scoreImportReadiness(input: {
  candidate: NormalizedDestinationCandidate
  validationReasons: ImportValidationReason[]
  duplicateDecision: DuplicateDecision
  imageAccepted: boolean
}): DestinationImportReadiness {
  const { candidate, validationReasons, duplicateDecision, imageAccepted } = input
  let score = 30
  if (candidate.name.trim()) score += 10
  if (candidate.sourceRecordId) score += 10
  if (Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)) score += 15
  if (candidate.category !== 'other') score += 12
  if (hasStrongIdentitySignal(candidate)) score += 10
  if (candidate.locality || candidate.administrativeArea) score += 5
  if (candidate.shortDescription || candidate.websiteUrl || candidate.openingHoursRaw) score += 5
  if (candidate.wikidataId || candidate.wikipediaUrl || candidate.commonsCategory) score += 5
  if (imageAccepted) score += 3
  score -= duplicatePenalty(duplicateDecision)
  score -= validationReasons.length * 5

  const bounded = Math.max(0, Math.min(100, score))
  const reasons = [...new Set(validationReasons)]
  if (bounded < 55 && !reasons.includes('LOW_IMPORT_READINESS')) reasons.push('LOW_IMPORT_READINESS')

  return {
    score: bounded,
    status: statusFor(bounded, reasons),
    reasons,
  }
}

function bounded(score: number): number {
  return Math.max(0, Math.min(100, Number(score.toFixed(1))))
}

function tagValue(candidate: NormalizedDestinationCandidate, key: string): string | null {
  const value = candidate.rawTags[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function weaklyNamed(candidate: NormalizedDestinationCandidate): boolean {
  const normalized = normalizeCandidateName(candidate.name)
  if (!normalized && !candidate.names.local) return true
  if (['artwork', 'landmark', 'monument', 'memorial', 'statue', 'shrine'].includes(normalized)) return true
  return candidate.nameIdentityKeys.length === 0
}

function administrativeOrFacilitySignal(candidate: NormalizedDestinationCandidate): boolean {
  const normalized = normalizeCandidateName(candidate.name)
  return [
    'office',
    'department',
    'faculty',
    'school',
    'university',
    'factory',
    'administration',
    'headquarters',
  ].some((term) => normalized.includes(term))
}

function subordinateObjectSignal(candidate: NormalizedDestinationCandidate): boolean {
  const normalized = normalizeCandidateName(candidate.name)
  return [
    'entrance',
    'gate',
    'pier',
    'platform',
    'stop',
    'station entrance',
    'ticket office',
  ].some((term) => normalized.includes(term))
}

function minorArtworkOrMonumentSignal(candidate: NormalizedDestinationCandidate): boolean {
  const tourism = tagValue(candidate, 'tourism')
  const historic = tagValue(candidate, 'historic')
  const normalized = normalizeCandidateName(candidate.name)
  return (
    tourism === 'artwork' ||
    historic === 'memorial' ||
    historic === 'monument' ||
    ['statue', 'memorial', 'monument', 'sculpture'].some((term) => normalized.includes(term))
  )
}

function geometryCentroidSignal(candidate: NormalizedDestinationCandidate): boolean {
  return candidate.sourceObjectType === 'way' || candidate.sourceObjectType === 'relation'
}

function identityConfidence(candidate: NormalizedDestinationCandidate): number {
  let score = 25
  if (candidate.sourceRecordId) score += 20
  if (candidate.name.trim()) score += 10
  if (candidate.names.local) score += 8
  if (candidate.names.english) score += 8
  if (candidate.wikidataId) score += 18
  if (candidate.wikipediaUrl) score += 8
  if (candidate.websiteUrl) score += 6
  if (strongIdentitySignals(candidate).length >= 2) score += 8
  if (weaklyNamed(candidate)) score -= 20
  return bounded(score)
}

function tourismRelevance(candidate: NormalizedDestinationCandidate): number {
  const categoryScore: Record<string, number> = {
    museum: 92,
    gallery: 88,
    viewpoint: 86,
    zoo: 86,
    aquarium: 86,
    theme_park: 86,
    historic: 84,
    heritage: 84,
    place_of_worship: 82,
    park: 78,
    nature_reserve: 78,
    market: 76,
    cultural_venue: 76,
    artwork: 62,
    landmark: 58,
    beach: 82,
    peak: 72,
    waterfall: 82,
    other: 25,
  }
  let score = categoryScore[candidate.category] ?? 40
  if (candidate.wikidataId || candidate.wikipediaUrl || candidate.websiteUrl) score += 8
  if (minorArtworkOrMonumentSignal(candidate)) score -= candidate.wikidataId ? 8 : 18
  if (administrativeOrFacilitySignal(candidate) && !candidate.wikidataId) score -= 20
  if (subordinateObjectSignal(candidate) && candidate.category !== 'historic') score -= 18
  if (transportOnlyAssessment(candidate).isTransportOnly) score -= 50
  return bounded(score)
}

function itineraryUsefulness(candidate: NormalizedDestinationCandidate): number {
  let score = tourismRelevance(candidate) * 0.6 + identityConfidence(candidate) * 0.25
  if (candidate.shortDescription) score += 6
  if (candidate.openingHoursRaw) score += 5
  if (candidate.websiteUrl) score += 5
  if (candidate.imageUrl && candidate.imageLicense && candidate.imageAttribution) score += 5
  if (!candidate.names.english) score -= 3
  if (candidate.category === 'artwork' && !candidate.wikidataId && !candidate.wikipediaUrl) score -= 12
  if (subordinateObjectSignal(candidate)) score -= 12
  if (administrativeOrFacilitySignal(candidate) && !candidate.websiteUrl && !candidate.wikidataId) score -= 14
  return bounded(score)
}

function localityConfidence(candidate: NormalizedDestinationCandidate, area: DestinationImportArea): number {
  if (!validCoordinate(candidate.latitude, candidate.longitude)) return 0
  let score = isCoordinateInsideArea(area, candidate.latitude, candidate.longitude) ? 78 : 20
  const locality = candidate.locality ? normalizeCandidateName(candidate.locality) : ''
  const expected = new Set([area.name, ...area.aliases].map(normalizeCandidateName))
  if (locality && expected.has(locality)) score += 16
  else if (locality && locality !== normalizeCandidateName(area.countryName)) score -= 28
  if (geometryCentroidSignal(candidate)) score -= 4
  return bounded(score)
}

function enrichmentCompleteness(candidate: NormalizedDestinationCandidate): number {
  let score = 20
  if (candidate.names.english) score += 16
  if (candidate.wikidataId) score += 18
  if (candidate.wikipediaUrl) score += 10
  if (candidate.commonsCategory) score += 8
  if (candidate.websiteUrl) score += 10
  if (candidate.shortDescription) score += 8
  if (candidate.openingHoursRaw) score += 5
  if (candidate.imageUrl && candidate.imageLicense && candidate.imageAttribution) score += 15
  return bounded(score)
}

function duplicateRisk(decision: DuplicateDecision, confidence: number): number {
  if (decision === 'exact_duplicate') return 100
  if (decision === 'probable_duplicate') return Math.max(80, confidence)
  if (decision === 'possible_duplicate') return Math.max(55, confidence)
  if (decision === 'conflict') return Math.max(90, confidence)
  return 0
}

function reviewReasons(input: {
  candidate: NormalizedDestinationCandidate
  duplicateDecision: DuplicateDecision
  qualityScores: DestinationImportQualityScores
  validationReasons: ImportValidationReason[]
}): string[] {
  const { candidate, duplicateDecision, qualityScores, validationReasons } = input
  const reasons: string[] = []

  if (duplicateDecision === 'exact_duplicate') reasons.push('EXISTING_OR_BATCH_EXACT_DUPLICATE')
  if (duplicateDecision === 'probable_duplicate') reasons.push('PROBABLE_DUPLICATE_REVIEW')
  if (duplicateDecision === 'possible_duplicate') reasons.push('POSSIBLE_DUPLICATE_REVIEW')
  if (duplicateDecision === 'conflict') reasons.push('DUPLICATE_CONFLICT')
  if (qualityScores.identityConfidence < 60) reasons.push('LOW_IDENTITY_CONFIDENCE')
  if (qualityScores.tourismRelevance < 65) reasons.push('LOW_TOURISM_RELEVANCE')
  if (qualityScores.itineraryUsefulness < 65) reasons.push('LOW_ITINERARY_USEFULNESS')
  if (candidate.category === 'landmark' && tagValue(candidate, 'tourism') === 'attraction') {
    reasons.push('GENERIC_LANDMARK_FROM_TOURISM_ATTRACTION')
  }
  if (weaklyNamed(candidate)) reasons.push('WEAK_OR_GENERIC_NAME')
  if (subordinateObjectSignal(candidate)) reasons.push('SUBORDINATE_OBJECT_OR_ENTRANCE')
  if (minorArtworkOrMonumentSignal(candidate)) reasons.push('MINOR_ARTWORK_OR_MONUMENT_CHECK')
  if (administrativeOrFacilitySignal(candidate)) reasons.push('ADMINISTRATIVE_OR_FACILITY_SIGNAL')
  if (geometryCentroidSignal(candidate)) reasons.push('CENTROID_COORDINATE_CHECK')
  for (const reason of validationReasons) reasons.push(reason)

  return [...new Set(reasons)]
}

export function scoreDestinationCandidateQuality(input: {
  candidate: NormalizedDestinationCandidate
  area: DestinationImportArea
  duplicateDecision: DuplicateDecision
  duplicateConfidence: number
  importReadinessScore: number
  validationReasons: ImportValidationReason[]
}): { scores: DestinationImportQualityScores; reviewReasons: string[] } {
  const scores: DestinationImportQualityScores = {
    importReadiness: input.importReadinessScore,
    identityConfidence: identityConfidence(input.candidate),
    tourismRelevance: tourismRelevance(input.candidate),
    itineraryUsefulness: itineraryUsefulness(input.candidate),
    localityConfidence: localityConfidence(input.candidate, input.area),
    duplicateRisk: duplicateRisk(input.duplicateDecision, input.duplicateConfidence),
    enrichmentCompleteness: enrichmentCompleteness(input.candidate),
  }

  return {
    scores,
    reviewReasons: reviewReasons({
      candidate: input.candidate,
      duplicateDecision: input.duplicateDecision,
      qualityScores: scores,
      validationReasons: input.validationReasons,
    }),
  }
}
