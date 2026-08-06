import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import type {
  ImportValidationReason,
  ImportValidationStatus,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'
import {
  hasStrongIdentitySignal,
  isChainOrGenericBusiness,
  isCoordinateInsideArea,
  isGenericName,
  isTransportOnlyName,
  transportOnlyAssessment,
  validCoordinate,
} from '@/services/destinations/importPipeline/utils'
import { assertDestinationSourceUsable, DestinationSourceRegistryError } from '@/services/destinations/sources/sourceRegistry'

const SUPPORTED_CATEGORIES = new Set([
  'landmark',
  'museum',
  'gallery',
  'viewpoint',
  'zoo',
  'aquarium',
  'theme_park',
  'artwork',
  'historic',
  'heritage',
  'beach',
  'peak',
  'waterfall',
  'park',
  'nature_reserve',
  'place_of_worship',
  'market',
  'cultural_venue',
])

function registryReason(error: DestinationSourceRegistryError): ImportValidationReason {
  return error.code
}

function statusForReasons(reasons: ImportValidationReason[]): ImportValidationStatus {
  const hardRejects = new Set<ImportValidationReason>([
    'SOURCE_NOT_REGISTERED',
    'SOURCE_DISABLED',
    'SOURCE_LICENSE_MISSING',
    'SOURCE_COMMERCIAL_REUSE_DISALLOWED',
    'SOURCE_HTML_SCRAPING_DISABLED',
    'MISSING_NAME',
    'MISSING_SOURCE_RECORD_ID',
    'MISSING_COORDINATES',
    'INVALID_COORDINATES',
    'OUT_OF_BOUNDS',
    'UNSUPPORTED_CATEGORY',
    'GENERIC_NAME',
    'CHAIN_OR_GENERIC_BUSINESS',
    'TRANSPORT_ONLY',
  ])
  if (reasons.some((reason) => hardRejects.has(reason))) return 'rejected'
  if (reasons.length > 0) return 'review'
  return 'accepted'
}

export function validateImportCandidate(
  candidate: NormalizedDestinationCandidate,
  area: DestinationImportArea
): { status: ImportValidationStatus; reasons: ImportValidationReason[] } {
  const reasons: ImportValidationReason[] = []
  try {
    assertDestinationSourceUsable(candidate.sourceId)
  } catch (error) {
    if (error instanceof DestinationSourceRegistryError) reasons.push(registryReason(error))
    else throw error
  }

  if (!candidate.name.trim()) reasons.push('MISSING_NAME')
  if (!candidate.sourceRecordId.trim()) reasons.push('MISSING_SOURCE_RECORD_ID')
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) {
    reasons.push('MISSING_COORDINATES')
  } else if (!validCoordinate(candidate.latitude, candidate.longitude)) {
    reasons.push('INVALID_COORDINATES')
  } else if (!isCoordinateInsideArea(area, candidate.latitude, candidate.longitude)) {
    reasons.push('OUT_OF_BOUNDS')
  }
  if (!SUPPORTED_CATEGORIES.has(candidate.category)) reasons.push('UNSUPPORTED_CATEGORY')
  if (isGenericName(candidate.name)) reasons.push('GENERIC_NAME')
  if (!hasStrongIdentitySignal(candidate)) reasons.push('LOW_IDENTITY_SIGNAL')
  if (isChainOrGenericBusiness(candidate)) reasons.push('CHAIN_OR_GENERIC_BUSINESS')
  if (isTransportOnlyName(candidate.name) || transportOnlyAssessment(candidate).isTransportOnly) {
    reasons.push('TRANSPORT_ONLY')
  }

  return { status: statusForReasons([...new Set(reasons)]), reasons: [...new Set(reasons)] }
}
