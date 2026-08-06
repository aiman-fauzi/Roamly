import type {
  DestinationImportFieldChange,
  DestinationImportFieldProtection,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'
import { sourceContentHash, strongIdentitySignals } from '@/services/destinations/importPipeline/utils'

type MergeField = 'name' | 'description' | 'address' | 'latitude' | 'longitude' | 'websiteUrl' | 'phone'
type AttractionMergeData = Partial<{
  name: string
  description: string
  address: string
  latitude: number
  longitude: number
  websiteUrl: string
  phone: string
}>

export interface ExistingAttractionMergeState {
  name: string | null
  description: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  websiteUrl: string | null
  phone: string | null
}

export interface SourceProvenanceMergeState {
  sourceProvider: string
  sourceRecordId: string
  importConfidence: number | null
  manuallyCurated: boolean
}

export interface AttractionImportMergePlan {
  data: AttractionMergeData
  changedFields: DestinationImportFieldChange[]
  protectedFields: DestinationImportFieldProtection[]
  importConfidence: number
  providerManaged: boolean
}

function candidateValue(candidate: NormalizedDestinationCandidate, field: MergeField): string | number | null {
  switch (field) {
    case 'name':
      return candidate.name.slice(0, 200)
    case 'description':
      return candidate.shortDescription
    case 'address':
      return candidate.locality
    case 'latitude':
      return candidate.latitude
    case 'longitude':
      return candidate.longitude
    case 'websiteUrl':
      return candidate.websiteUrl
    case 'phone':
      return candidate.phoneNumber?.slice(0, 50) ?? null
  }
}

function sameValue(first: unknown, second: unknown): boolean {
  if (typeof first === 'number' && typeof second === 'number') return Math.abs(first - second) < 0.0000001
  return first === second
}

function assignMergeValue(data: AttractionMergeData, field: MergeField, value: string | number): void {
  switch (field) {
    case 'latitude':
    case 'longitude':
      if (typeof value === 'number') data[field] = value
      return
    case 'name':
    case 'description':
    case 'address':
    case 'websiteUrl':
    case 'phone':
      if (typeof value === 'string') data[field] = value
  }
}

export function candidateImportConfidence(candidate: NormalizedDestinationCandidate): number {
  let confidence = 65
  const signals = strongIdentitySignals(candidate)
  confidence += Math.min(20, signals.length * 5)
  if (candidate.names.english) confidence += 3
  if (candidate.names.local) confidence += 3
  if (candidate.imageUrl && candidate.imageLicense) confidence += 4
  if (candidate.websiteUrl) confidence += 5
  return Math.min(100, confidence)
}

export function planAttractionImportMerge(
  existing: ExistingAttractionMergeState,
  candidate: NormalizedDestinationCandidate,
  provenance: SourceProvenanceMergeState[]
): AttractionImportMergePlan {
  const importConfidence = candidateImportConfidence(candidate)
  const hasManualProvenance = provenance.some((row) => row.manuallyCurated)
  const managedProvenance = provenance.filter((row) => !row.manuallyCurated)
  const providerManaged = managedProvenance.length > 0 && !hasManualProvenance
  const previousConfidence = Math.max(0, ...managedProvenance.map((row) => row.importConfidence ?? 0))
  const canReplaceProviderField = providerManaged && importConfidence > previousConfidence
  const data: AttractionImportMergePlan['data'] = {}
  const changedFields: DestinationImportFieldChange[] = []
  const protectedFields: DestinationImportFieldProtection[] = []

  const fields: MergeField[] = ['name', 'description', 'address', 'latitude', 'longitude', 'websiteUrl', 'phone']
  for (const field of fields) {
    const currentValue = existing[field]
    const proposedValue = candidateValue(candidate, field)
    if (proposedValue == null || sameValue(currentValue, proposedValue)) continue

    if (currentValue == null || canReplaceProviderField) {
      assignMergeValue(data, field, proposedValue)
      changedFields.push({
        field,
        currentValue,
        proposedValue,
        reason: currentValue == null ? 'fill_empty_field' : 'replace_weaker_provider_field',
      })
      continue
    }

    protectedFields.push({
      field,
      currentValue,
      proposedValue,
      reason: hasManualProvenance ? 'manual_provenance' : 'existing_field_not_provider_managed',
    })
  }

  return {
    data,
    changedFields,
    protectedFields,
    importConfidence,
    providerManaged,
  }
}

export interface ExistingImageMergeState {
  url: string
  attribution: string | null
  sourceProvider: string | null
  sourceRecordId: string | null
  sourceUrl: string | null
  pageUrl: string | null
  author: string | null
  licenseName: string | null
  licenseUrl: string | null
}

export function imageSourceRecordId(candidate: NormalizedDestinationCandidate): string | null {
  const sourceIdentity = candidate.imagePageUrl ?? candidate.imageUrl
  return sourceIdentity ? `commons:${sourceContentHash(sourceIdentity).slice(0, 64)}` : null
}

export function planImageAttributionMerge(
  existing: ExistingImageMergeState | null,
  candidate: NormalizedDestinationCandidate
):
  | { action: 'none'; protected: boolean }
  | { action: 'create'; protected: false }
  | { action: 'complete_metadata'; protected: false; data: Partial<ExistingImageMergeState> }
  | { action: 'protect_existing_image'; protected: true } {
  if (!candidate.imageUrl || !candidate.imageAttribution) return { action: 'none', protected: false }
  if (!existing) return { action: 'create', protected: false }
  if (existing.url !== candidate.imageUrl) return { action: 'protect_existing_image', protected: true }

  const data: Partial<ExistingImageMergeState> = {}
  if (!existing.attribution) data.attribution = candidate.imageAttribution.slice(0, 255)
  if (!existing.sourceProvider) data.sourceProvider = 'wikimedia-commons'
  if (!existing.sourceRecordId) data.sourceRecordId = imageSourceRecordId(candidate)
  if (!existing.sourceUrl) data.sourceUrl = candidate.imageUrl
  if (!existing.pageUrl) data.pageUrl = candidate.imagePageUrl
  if (!existing.author) data.author = candidate.imageAuthor?.slice(0, 255) ?? null
  if (!existing.licenseName) data.licenseName = candidate.imageLicense?.slice(0, 120) ?? null
  if (!existing.licenseUrl) data.licenseUrl = candidate.imageLicenseUrl

  return Object.keys(data).length > 0
    ? { action: 'complete_metadata', protected: false, data }
    : { action: 'none', protected: false }
}
