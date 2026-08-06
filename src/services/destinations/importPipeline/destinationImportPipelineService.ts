import { DestinationFactEntityType, DestinationImportSource, type Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/db/client'
import { slugify } from '@/import/normalization'
import { evaluateDuplicateCandidate } from '@/services/destinations/importPipeline/deduplication'
import type { DestinationImportArea } from '@/services/destinations/importPipeline/destinationAreas'
import { DestinationImportHttpClient, type DestinationImportFetcher } from '@/services/destinations/importPipeline/httpClient'
import {
  candidateImportConfidence,
  imageSourceRecordId,
  planAttractionImportMerge,
  planImageAttributionMerge,
  type SourceProvenanceMergeState,
} from '@/services/destinations/importPipeline/mergeProtection'
import { OpenStreetMapAttractionProvider } from '@/services/destinations/importPipeline/providers/openStreetMapProvider'
import { WikidataProvider, type WikidataEntityMetadata } from '@/services/destinations/importPipeline/providers/wikidataProvider'
import { WikimediaCommonsProvider } from '@/services/destinations/importPipeline/providers/wikimediaCommonsProvider'
import {
  scoreDestinationCandidateQuality,
  scoreImportReadiness,
} from '@/services/destinations/importPipeline/scoring'
import type {
  DestinationCandidateEnrichment,
  DestinationImportCandidateDecision,
  DestinationImportPipelineOptions,
  DestinationImportPipelineReport,
  DestinationImportPilotManifest,
  DestinationImportPilotManifestCandidate,
  ExistingDestinationForDeduplication,
  ImportValidationReason,
  NormalizedDestinationCandidate,
} from '@/services/destinations/importPipeline/types'
import {
  candidateNameIdentityKeys,
  distanceMeters,
  isCoordinateInsideArea,
  normalizeCandidateName,
  normalizeNameIdentityKeys,
  sourceContentHash,
  strongIdentitySignals,
} from '@/services/destinations/importPipeline/utils'
import { validateImportCandidate } from '@/services/destinations/importPipeline/validation'
import { attributionForSource } from '@/services/destinations/sources/sourceRegistry'

interface DestinationImportPipelineServiceOptions {
  db?: PrismaClient
  fetcher?: DestinationImportFetcher
  httpClient?: DestinationImportHttpClient
  osmProvider?: Pick<OpenStreetMapAttractionProvider, 'discover'>
  wikidataProvider?: Pick<WikidataProvider, 'fetchEntityMetadata'>
  commonsProvider?: Pick<WikimediaCommonsProvider, 'fetchLicensedImageByFileName' | 'fetchFirstLicensedCategoryImage'>
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function areaSummary(area: DestinationImportArea) {
  return {
    slug: area.slug,
    name: area.name,
    countryCode: area.countryCode,
    countryName: area.countryName,
    areaType: area.areaType,
  }
}

function emptyDistribution(): Record<string, number> {
  return {}
}

function increment(distribution: Record<string, number>, key: string) {
  distribution[key] = (distribution[key] ?? 0) + 1
}

function coverage(count: number, total: number) {
  return {
    count,
    total,
    percent: total === 0 ? 0 : Number(((count / total) * 100).toFixed(1)),
  }
}

function parseExternalIds(value: unknown): {
  wikidataId?: string | null
  wikipediaUrl?: string | null
  commonsCategory?: string | null
} {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    wikidataId: typeof record.wikidataId === 'string' ? record.wikidataId : null,
    wikipediaUrl: typeof record.wikipediaUrl === 'string' ? record.wikipediaUrl : null,
    commonsCategory: typeof record.commonsCategory === 'string' ? record.commonsCategory : null,
  }
}

function isMissingProvenanceTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybePrismaError = error as { code?: unknown; message?: unknown }
  return (
    maybePrismaError.code === 'P2021' ||
    (typeof maybePrismaError.message === 'string' &&
      maybePrismaError.message.includes('destination_source_provenance'))
  )
}

function localityMismatch(candidate: NormalizedDestinationCandidate, area: DestinationImportArea): boolean {
  if (!candidate.locality) return false
  const expected = new Set([area.name, ...area.aliases].map(normalizeCandidateName))
  const locality = normalizeCandidateName(candidate.locality)
  return locality.length > 0 && !expected.has(locality) && locality !== normalizeCandidateName(area.countryName)
}

function mergeEnrichment(
  candidate: NormalizedDestinationCandidate,
  metadata: WikidataEntityMetadata | null,
  image: DestinationCandidateEnrichment['image']
): NormalizedDestinationCandidate {
  if (!metadata && !image) return candidate
  const wikidataEnglishName = metadata?.englishLabel?.trim() || null
  const wikipediaEnglishName = metadata?.englishWikipediaTitle?.replace(/_/g, ' ').trim() || null
  const englishName = candidate.names.english ?? wikidataEnglishName ?? wikipediaEnglishName
  const englishNameSource =
    candidate.englishNameSource ??
    (wikidataEnglishName ? 'wikidata:en-label' : wikipediaEnglishName ? 'wikipedia:en-title' : null)
  return {
    ...candidate,
    aliases: [...new Set([...candidate.aliases, ...(metadata?.aliases ?? []), wikidataEnglishName, wikipediaEnglishName].filter(Boolean) as string[])],
    nameIdentityKeys: [
      ...new Set([
        ...candidateNameIdentityKeys(candidate),
        ...normalizeNameIdentityKeys([...(metadata?.aliases ?? []), wikidataEnglishName, wikipediaEnglishName]),
      ]),
    ],
    names: {
      ...candidate.names,
      english: englishName,
      aliases: [...new Set([...candidate.names.aliases, ...(metadata?.aliases ?? []), wikidataEnglishName, wikipediaEnglishName].filter(Boolean) as string[])],
    },
    englishNameSource,
    websiteUrl: candidate.websiteUrl ?? metadata?.officialWebsite ?? null,
    wikidataId: metadata?.wikidataId ?? candidate.wikidataId,
    wikipediaUrl: candidate.wikipediaUrl ?? metadata?.wikipediaUrl ?? null,
    commonsCategory: candidate.commonsCategory ?? metadata?.commonsCategory ?? null,
    imageUrl: image?.imageUrl ?? candidate.imageUrl,
    imagePageUrl: image?.imagePageUrl ?? candidate.imagePageUrl,
    imageAuthor: image?.imageAuthor ?? candidate.imageAuthor,
    imageLicense: image?.imageLicense ?? candidate.imageLicense,
    imageLicenseUrl: image?.imageLicenseUrl ?? candidate.imageLicenseUrl,
    imageAttribution: image?.imageAttribution ?? candidate.imageAttribution,
  }
}

function coordinateAgrees(candidate: NormalizedDestinationCandidate, metadata: WikidataEntityMetadata | null): boolean {
  if (!metadata?.coordinate) return true
  return distanceMeters(candidate, metadata.coordinate) <= 1000
}

function actionFor(decision: DestinationImportCandidateDecision): DestinationImportCandidateDecision['proposedAction'] {
  if (decision.importReadiness.status === 'rejected') return 'skip'
  if (decision.importReadiness.status === 'review') return 'review'
  if (decision.duplicateDecision === 'new') return 'insert'
  if (decision.duplicateDecision === 'probable_duplicate' && decision.duplicateOf?.startsWith('ATTRACTION:')) return 'update'
  return 'review'
}

function reportJobId(options: DestinationImportPipelineOptions): string {
  const mode = options.commit ? 'commit' : 'dry-run'
  return `${mode}:${options.provider}:${options.area.slug}:${options.limit}:${Date.now()}`
}

function stableAttractionSlug(candidate: NormalizedDestinationCandidate): string {
  const candidates = [
    candidate.names.english,
    candidate.name,
    candidate.names.local,
    candidate.names.aliases[0],
    candidate.sourceRecordId,
  ]
  for (const value of candidates) {
    if (!value) continue
    const slug = slugify(value).slice(0, 220)
    if (slug) return slug
  }
  return slugify(candidate.sourceRecordId).slice(0, 220)
}

function manifestCandidateIds(manifest: DestinationImportPilotManifest | null | undefined): Set<string> {
  return new Set(manifest?.candidates.map(manifestSourceRecordId) ?? [])
}

function manifestSourceRecordId(candidate: DestinationImportPilotManifestCandidate): string {
  return candidate.sourceRecordId ?? candidate.sourceId
}

function sameCoordinate(first: number, second: number): boolean {
  return Math.abs(first - second) <= 0.000001
}

function verifyManifestForDecisions(
  manifest: DestinationImportPilotManifest,
  options: DestinationImportPipelineOptions,
  decisions: DestinationImportCandidateDecision[]
): void {
  if (manifest.areaSlug !== options.area.slug) {
    throw new Error(`Manifest area ${manifest.areaSlug} does not match requested area ${options.area.slug}.`)
  }
  if (manifest.provider !== options.provider) {
    throw new Error(`Manifest provider ${manifest.provider} does not match requested provider ${options.provider}.`)
  }
  if (manifest.limit !== options.limit) {
    throw new Error(`Manifest limit ${manifest.limit} does not match requested limit ${options.limit}.`)
  }

    const decisionsBySourceId = new Map(decisions.map((decision) => [decision.candidate.sourceRecordId, decision]))
  for (const manifestCandidate of manifest.candidates) {
    const manifestId = manifestSourceRecordId(manifestCandidate)
    const decision = decisionsBySourceId.get(manifestId)
    if (!decision) throw new Error(`Manifest candidate missing from live source results: ${manifestId}`)
    const candidate = decision.candidate
    const mismatches: string[] = []
    if (manifestCandidate.sourceProvider && candidate.sourceId !== manifestCandidate.sourceProvider) {
      mismatches.push('sourceProvider')
    }
    if (candidate.name !== manifestCandidate.name) mismatches.push('name')
    if ((candidate.names.local ?? null) !== manifestCandidate.localName) mismatches.push('localName')
    if ((candidate.names.english ?? null) !== manifestCandidate.englishName) mismatches.push('englishName')
    if (
      manifestCandidate.englishNameSource !== undefined &&
      (candidate.englishNameSource ?? null) !== manifestCandidate.englishNameSource
    ) {
      mismatches.push('englishNameSource')
    }
    if (candidate.category !== manifestCandidate.category) mismatches.push('category')
    if (
      manifestCandidate.subcategories &&
      JSON.stringify(candidate.subcategories) !== JSON.stringify(manifestCandidate.subcategories)
    ) {
      mismatches.push('subcategories')
    }
    if (!sameCoordinate(candidate.latitude, manifestCandidate.latitude)) mismatches.push('latitude')
    if (!sameCoordinate(candidate.longitude, manifestCandidate.longitude)) mismatches.push('longitude')
    if ((candidate.wikidataId ?? null) !== manifestCandidate.wikidataId) mismatches.push('wikidataId')
    if (manifestCandidate.websiteUrl !== undefined && (candidate.websiteUrl ?? null) !== manifestCandidate.websiteUrl) {
      mismatches.push('websiteUrl')
    }
    if ((candidate.sourceUrl ?? null) !== manifestCandidate.sourceUrl) mismatches.push('sourceUrl')
    if (manifestCandidate.imageUrl !== undefined && (candidate.imageUrl ?? null) !== manifestCandidate.imageUrl) {
      mismatches.push('imageUrl')
    }
    if (
      manifestCandidate.imagePageUrl !== undefined &&
      (candidate.imagePageUrl ?? null) !== manifestCandidate.imagePageUrl
    ) {
      mismatches.push('imagePageUrl')
    }
    if (
      manifestCandidate.imageAuthor !== undefined &&
      (candidate.imageAuthor ?? null) !== manifestCandidate.imageAuthor
    ) {
      mismatches.push('imageAuthor')
    }
    if ((candidate.imageLicense ?? null) !== manifestCandidate.imageLicense) mismatches.push('imageLicense')
    if (
      manifestCandidate.imageLicenseUrl !== undefined &&
      (candidate.imageLicenseUrl ?? null) !== manifestCandidate.imageLicenseUrl
    ) {
      mismatches.push('imageLicenseUrl')
    }
    if (
      manifestCandidate.imageAttribution !== undefined &&
      (candidate.imageAttribution ?? null) !== manifestCandidate.imageAttribution
    ) {
      mismatches.push('imageAttribution')
    }
    if (mismatches.length > 0) {
      throw new Error(`Manifest candidate changed for ${manifestId}: ${mismatches.join(', ')}`)
    }

    if (
      ['probable_duplicate', 'possible_duplicate', 'conflict'].includes(decision.duplicateDecision) &&
      decision.proposedAction !== 'update'
    ) {
      throw new Error(
        `Manifest candidate ${manifestId} now has unresolved duplicate status ${decision.duplicateDecision}.`
      )
    }
  }
}

function hasExistingDatabaseMatch(decision: DestinationImportCandidateDecision): boolean {
  return Boolean(decision.duplicateDiagnostic?.matchedEntityId || decision.duplicateOf?.startsWith('ATTRACTION:'))
}

function hasProposedChanges(decision: DestinationImportCandidateDecision): boolean {
  return Boolean(decision.proposedFieldChanges?.length || decision.protectedFields?.length)
}

export class DestinationImportPipelineService {
  private readonly db: PrismaClient
  private readonly httpClient: DestinationImportHttpClient
  private readonly osmProvider: Pick<OpenStreetMapAttractionProvider, 'discover'>
  private readonly wikidataProvider: Pick<WikidataProvider, 'fetchEntityMetadata'>
  private readonly commonsProvider: Pick<WikimediaCommonsProvider, 'fetchLicensedImageByFileName' | 'fetchFirstLicensedCategoryImage'>

  constructor(options: DestinationImportPipelineServiceOptions = {}) {
    this.db = options.db ?? prisma
    this.httpClient = options.httpClient ?? new DestinationImportHttpClient({ fetcher: options.fetcher })
    this.osmProvider = options.osmProvider ?? new OpenStreetMapAttractionProvider(this.httpClient)
    this.wikidataProvider = options.wikidataProvider ?? new WikidataProvider(this.httpClient)
    this.commonsProvider = options.commonsProvider ?? new WikimediaCommonsProvider(this.httpClient)
  }

  private async existingAttractions(area: DestinationImportArea): Promise<ExistingDestinationForDeduplication[]> {
    const rows = await this.db.attraction.findMany({
      where: {
        deletedAt: null,
        city: {
          slug: area.slug,
          country: {
            iso2: area.countryCode,
            deletedAt: null,
          },
          deletedAt: null,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        websiteUrl: true,
        phone: true,
      },
    })

    const provenanceDelegate = (
      this.db as unknown as {
        destinationSourceProvenance?: {
          findMany: (args: {
            where: { entityType: DestinationFactEntityType; entityId: { in: string[] } }
            select: {
              entityId: true
              sourceProvider: true
              sourceRecordId: true
              externalIds: true
              importConfidence: true
              manuallyCurated: true
            }
          }) => Promise<
            Array<{
              entityId: string
              sourceProvider: string
              sourceRecordId: string
              externalIds: unknown
              importConfidence: number | null
              manuallyCurated: boolean
            }>
          >
        }
      }
    ).destinationSourceProvenance
    const provenanceRows = provenanceDelegate
      ? await provenanceDelegate
          .findMany({
            where: {
              entityType: DestinationFactEntityType.ATTRACTION,
              entityId: { in: rows.map((row) => row.id) },
            },
            select: {
              entityId: true,
              sourceProvider: true,
              sourceRecordId: true,
              externalIds: true,
              importConfidence: true,
              manuallyCurated: true,
            },
          })
          .catch((error: unknown) => {
            if (isMissingProvenanceTableError(error)) return []
            throw error
          })
      : []
    const provenanceByEntity = new Map<string, typeof provenanceRows>()
    for (const row of provenanceRows) {
      const existing = provenanceByEntity.get(row.entityId) ?? []
      existing.push(row)
      provenanceByEntity.set(row.entityId, existing)
    }

    return rows.map((row) => ({
      entityType: DestinationFactEntityType.ATTRACTION,
      entityId: row.id,
      name: row.name,
      slug: row.slug,
      nameIdentityKeys: normalizeNameIdentityKeys([row.name, row.slug]),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      description: row.description,
      address: row.address,
      websiteUrl: row.websiteUrl,
      phone: row.phone,
      sourceRecordIds: (provenanceByEntity.get(row.id) ?? []).map((provenance) => provenance.sourceRecordId),
      wikidataIds: (provenanceByEntity.get(row.id) ?? [])
        .map((provenance) => parseExternalIds(provenance.externalIds).wikidataId)
        .filter((wikidataId): wikidataId is string => Boolean(wikidataId)),
      wikipediaUrls: (provenanceByEntity.get(row.id) ?? [])
        .map((provenance) => parseExternalIds(provenance.externalIds).wikipediaUrl)
        .filter((wikipediaUrl): wikipediaUrl is string => Boolean(wikipediaUrl)),
      manuallyCurated: (provenanceByEntity.get(row.id) ?? []).some((provenance) => provenance.manuallyCurated),
      providerManaged: (provenanceByEntity.get(row.id) ?? []).some((provenance) => !provenance.manuallyCurated),
      importConfidence: Math.max(
        0,
        ...(provenanceByEntity.get(row.id) ?? []).map((provenance) => provenance.importConfidence ?? 0)
      ),
    }))
  }

  private async enrichCandidate(
    candidate: NormalizedDestinationCandidate
  ): Promise<{ candidate: NormalizedDestinationCandidate; reasons: ImportValidationReason[] }> {
    const reasons: ImportValidationReason[] = []
    let metadata: WikidataEntityMetadata | null = null
    let image: DestinationCandidateEnrichment['image'] = null

    try {
      if (candidate.wikidataId) {
        metadata = await this.wikidataProvider.fetchEntityMetadata(candidate.wikidataId)
        if (!coordinateAgrees(candidate, metadata)) {
          reasons.push('ENRICHMENT_COORDINATE_MISMATCH')
          metadata = null
        }
      }

      const imageFileName = metadata?.imageFileName
      const commonsCategory = candidate.commonsCategory ?? metadata?.commonsCategory
      if (imageFileName) image = await this.commonsProvider.fetchLicensedImageByFileName(imageFileName)
      else if (commonsCategory) image = await this.commonsProvider.fetchFirstLicensedCategoryImage(commonsCategory)
      if ((imageFileName || commonsCategory) && !image) reasons.push('IMAGE_LICENSE_UNSUPPORTED')
    } catch {
      reasons.push('PROVIDER_FAILURE')
    }

    return {
      candidate: mergeEnrichment(candidate, metadata, image),
      reasons,
    }
  }

  private async resolveOrCreateCity(area: DestinationImportArea) {
    const country = await this.db.country.upsert({
      where: { slug: area.countrySlug },
      update: { deletedAt: null },
      create: {
        name: area.countryName,
        slug: area.countrySlug,
        iso2: area.countryCode,
        iso3: area.countryIso3,
        currencyCode: area.currencyCode,
        phoneCode: area.phoneCode,
      },
    })

    return this.db.city.upsert({
      where: { countryId_slug: { countryId: country.id, slug: area.slug } },
      update: {
        deletedAt: null,
      },
      create: {
        countryId: country.id,
        name: area.name.slice(0, 160),
        slug: area.slug.slice(0, 180),
        latitude: (area.boundingBox.south + area.boundingBox.north) / 2,
        longitude: (area.boundingBox.west + area.boundingBox.east) / 2,
      },
    })
  }

  private async connectTags(tx: Prisma.TransactionClient, candidate: NormalizedDestinationCandidate) {
    const tagNames = [...new Set([candidate.category, ...candidate.subcategories].filter(Boolean))].slice(0, 20)
    const tags = []
    for (const tagName of tagNames) {
      const slug = slugify(tagName).slice(0, 120)
      if (!slug) continue
      const tag = await tx.destinationTag.upsert({
        where: { slug },
        update: { name: tagName.slice(0, 100) },
        create: { slug, name: tagName.slice(0, 100) },
        select: { id: true },
      })
      tags.push(tag)
    }
    return tags
  }

  private async upsertCandidate(candidate: NormalizedDestinationCandidate, area: DestinationImportArea): Promise<'inserted' | 'updated'> {
    const city = await this.resolveOrCreateCity(area)
    const attractionSlug = stableAttractionSlug(candidate)

    return this.db.$transaction(async (tx) => {
      const existing = await tx.attraction.findUnique({
        where: { cityId_slug: { cityId: city.id, slug: attractionSlug } },
      })
      const existingProvenance: SourceProvenanceMergeState[] = existing
        ? await tx.destinationSourceProvenance.findMany({
            where: {
              entityType: DestinationFactEntityType.ATTRACTION,
              entityId: existing.id,
            },
            select: {
              sourceProvider: true,
              sourceRecordId: true,
              importConfidence: true,
              manuallyCurated: true,
            },
          })
        : []
      const mergePlan = existing
        ? planAttractionImportMerge(
            {
              name: existing.name,
              description: existing.description,
              address: existing.address,
              latitude: toNumber(existing.latitude),
              longitude: toNumber(existing.longitude),
              websiteUrl: existing.websiteUrl,
              phone: existing.phone,
            },
            candidate,
            existingProvenance
          )
        : null
      const tags = await this.connectTags(tx, candidate)
      const attraction = await tx.attraction.upsert({
        where: { cityId_slug: { cityId: city.id, slug: attractionSlug } },
        update: {
          ...(mergePlan?.data ?? {}),
          deletedAt: null,
          tags: tags.length > 0 ? { connect: tags } : undefined,
        },
        create: {
          cityId: city.id,
          name: candidate.name.slice(0, 200),
          slug: attractionSlug,
          description: candidate.shortDescription ?? undefined,
          address: candidate.locality ?? undefined,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          websiteUrl: candidate.websiteUrl ?? undefined,
          phone: candidate.phoneNumber?.slice(0, 50),
          tags: tags.length > 0 ? { connect: tags } : undefined,
        },
      })

      if (candidate.imageUrl && candidate.imageAttribution) {
        const existingImage = await tx.destinationImage.findFirst({
          where: { attractionId: attraction.id, deletedAt: null, isPrimary: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            url: true,
            attribution: true,
            sourceProvider: true,
            sourceRecordId: true,
            sourceUrl: true,
            pageUrl: true,
            author: true,
            licenseName: true,
            licenseUrl: true,
          },
        })
        const imagePlan = planImageAttributionMerge(existingImage, candidate)
        if (imagePlan.action === 'create') {
          await tx.destinationImage.create({
            data: {
              attractionId: attraction.id,
              url: candidate.imageUrl,
              altText: candidate.name.slice(0, 255),
              attribution: candidate.imageAttribution.slice(0, 255),
              sourceProvider: 'wikimedia-commons',
              sourceRecordId: imageSourceRecordId(candidate),
              sourceUrl: candidate.imageUrl,
              pageUrl: candidate.imagePageUrl,
              author: candidate.imageAuthor?.slice(0, 255),
              licenseName: candidate.imageLicense?.slice(0, 120),
              licenseUrl: candidate.imageLicenseUrl,
              isPrimary: true,
            },
          })
        } else if (imagePlan.action === 'complete_metadata' && existingImage) {
          await tx.destinationImage.update({
            where: { id: existingImage.id },
            data: imagePlan.data,
          })
        }
      }

      await tx.destinationSourceProvenance.upsert({
        where: {
          sourceProvider_sourceRecordId: {
            sourceProvider: candidate.sourceId,
            sourceRecordId: candidate.sourceRecordId,
          },
        },
        update: {
          entityType: DestinationFactEntityType.ATTRACTION,
          entityId: attraction.id,
          sourceUrl: candidate.sourceUrl,
          sourceLicenseName: candidate.contentLicense,
          sourceLicenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
          attribution: candidate.contentAttribution ?? attributionForSource(candidate.sourceId),
          externalIds: {
            wikidataId: candidate.wikidataId,
            wikipediaUrl: candidate.wikipediaUrl,
            commonsCategory: candidate.commonsCategory,
            englishName: candidate.names.english,
            englishNameSource: candidate.englishNameSource,
          },
          rawPayload: candidate.rawSourcePayload as Prisma.InputJsonValue,
          sourceContentHash: sourceContentHash(candidate.rawSourcePayload),
          importConfidence: candidateImportConfidence(candidate),
          duplicateStatus: 'new',
          lastSourceSyncAt: new Date(),
        },
        create: {
          entityType: DestinationFactEntityType.ATTRACTION,
          entityId: attraction.id,
          sourceProvider: candidate.sourceId,
          sourceRecordId: candidate.sourceRecordId,
          sourceUrl: candidate.sourceUrl,
          sourceLicenseName: candidate.contentLicense,
          sourceLicenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
          attribution: candidate.contentAttribution ?? attributionForSource(candidate.sourceId),
          externalIds: {
            wikidataId: candidate.wikidataId,
            wikipediaUrl: candidate.wikipediaUrl,
            commonsCategory: candidate.commonsCategory,
            englishName: candidate.names.english,
            englishNameSource: candidate.englishNameSource,
          },
          rawPayload: candidate.rawSourcePayload as Prisma.InputJsonValue,
          sourceContentHash: sourceContentHash(candidate.rawSourcePayload),
          importConfidence: candidateImportConfidence(candidate),
          duplicateStatus: 'new',
          lastSourceSyncAt: new Date(),
        },
      })

      return existing ? 'updated' : 'inserted'
    })
  }

  private async createCommitJob(options: DestinationImportPipelineOptions) {
    return this.db.destinationImportJob.upsert({
      where: {
        source_sourceKey: {
          source: DestinationImportSource.OPENSTREETMAP,
          sourceKey: `asean:${options.provider}:${options.area.slug}:${options.limit}`,
        },
      },
      update: {
        status: 'RUNNING',
        cursor: 0,
        totalRecords: 0,
        processedRecords: 0,
        skippedRecords: 0,
        failedRecords: 0,
        config: options as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
      create: {
        source: DestinationImportSource.OPENSTREETMAP,
        sourceKey: `asean:${options.provider}:${options.area.slug}:${options.limit}`,
        status: 'RUNNING',
        config: options as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    })
  }

  async run(options: DestinationImportPipelineOptions): Promise<DestinationImportPipelineReport> {
    if (options.commit && options.dryRun) throw new Error('Pass either dry-run or commit mode, not both.')
    const startedAt = new Date()
    const stages = ['discover', 'normalize', 'validate', 'deduplicate', 'enrich', 'score', 'stage', 'report'] as const
    const existingDestinations = await this.existingAttractions(options.area)
    const existingByLabel: Map<string, ExistingDestinationForDeduplication> = new Map(
      existingDestinations.map((existing) => [`${existing.entityType}:${existing.entityId}`, existing] as const)
    )
    const rawCandidates = await this.osmProvider.discover({
      area: options.area,
      limit: options.limit,
      httpClient: this.httpClient,
    })

    let enrichmentAttempts = 0
    const enrichedCandidates: Array<{ candidate: NormalizedDestinationCandidate; reasons: ImportValidationReason[] }> = []
    for (const candidate of rawCandidates) {
      if (
        options.enrich &&
        enrichmentAttempts < options.maxEnrichmentRecords &&
        this.httpClient.getRequestCount() < options.maxRequests
      ) {
        enrichmentAttempts += 1
        enrichedCandidates.push(await this.enrichCandidate(candidate))
      } else {
        enrichedCandidates.push({ candidate, reasons: [] })
      }
    }

    const previous: NormalizedDestinationCandidate[] = []
    const decisions: DestinationImportCandidateDecision[] = []
    for (const enriched of enrichedCandidates) {
      const validation = validateImportCandidate(enriched.candidate, options.area)
      const duplicate = evaluateDuplicateCandidate(enriched.candidate, previous, existingDestinations)
      const validationReasons = [...new Set([...validation.reasons, ...enriched.reasons])]
      if (duplicate.decision === 'exact_duplicate') validationReasons.push('DUPLICATE_SOURCE_RECORD')
      if (duplicate.decision === 'probable_duplicate') validationReasons.push('PROBABLE_DUPLICATE')
      if (duplicate.decision === 'possible_duplicate') validationReasons.push('POSSIBLE_DUPLICATE')
      if (duplicate.decision === 'conflict') validationReasons.push('CONFLICTING_LOCALITY')

      const importReadiness = scoreImportReadiness({
        candidate: enriched.candidate,
        validationReasons: [...new Set(validationReasons)],
        duplicateDecision: duplicate.decision,
        imageAccepted: Boolean(enriched.candidate.imageUrl && enriched.candidate.imageLicense),
      })
      const quality = scoreDestinationCandidateQuality({
        candidate: enriched.candidate,
        area: options.area,
        duplicateDecision: duplicate.decision,
        duplicateConfidence: duplicate.confidence,
        importReadinessScore: importReadiness.score,
        validationReasons: [...new Set(validationReasons)],
      })
      const baseDecision: DestinationImportCandidateDecision = {
        candidate: enriched.candidate,
        validationStatus: validation.status,
        validationReasons: [...new Set(validationReasons)],
        duplicateDecision: duplicate.decision,
        duplicateConfidence: duplicate.confidence,
        duplicateOf: duplicate.duplicateOf,
        duplicateDiagnostic: duplicate.diagnostic,
        importReadiness,
        qualityScores: quality.scores,
        qualityReviewReasons: quality.reviewReasons,
        proposedAction: 'review',
      }
      const decision = { ...baseDecision, proposedAction: actionFor(baseDecision) }
      if (decision.proposedAction === 'update' && decision.duplicateOf) {
        const existing = existingByLabel.get(decision.duplicateOf)
        if (existing) {
          const mergePlan = planAttractionImportMerge(
            {
              name: existing.name,
              description: existing.description ?? null,
              address: existing.address ?? null,
              latitude: existing.latitude,
              longitude: existing.longitude,
              websiteUrl: existing.websiteUrl ?? null,
              phone: existing.phone ?? null,
            },
            enriched.candidate,
            existing.providerManaged
              ? [
                  {
                    sourceProvider: enriched.candidate.sourceId,
                    sourceRecordId: enriched.candidate.sourceRecordId,
                    importConfidence: existing.importConfidence ?? null,
                    manuallyCurated: Boolean(existing.manuallyCurated),
                  },
                ]
              : []
          )
          decision.proposedFieldChanges = mergePlan.changedFields
          decision.protectedFields = mergePlan.protectedFields
        }
      }
      decisions.push(decision)
      if (duplicate.decision !== 'exact_duplicate') previous.push(enriched.candidate)
    }

    let insertedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    let failedCount = 0
    let jobId = reportJobId(options)
    let errorSummary: string | null = null

    if (options.manifest) verifyManifestForDecisions(options.manifest, options, decisions)
    const manifestIds = manifestCandidateIds(options.manifest)
    const selectedDecisions = options.manifest
      ? decisions.filter((decision) => manifestIds.has(decision.candidate.sourceRecordId))
      : decisions

    if (options.commit) {
      const job = await this.createCommitJob(options)
      jobId = job.id
      const commitCandidates = selectedDecisions.filter(
        (decision) => decision.proposedAction === 'insert' || decision.proposedAction === 'update'
      )
      skippedCount = selectedDecisions.length - commitCandidates.length
      for (const [index, decision] of commitCandidates.entries()) {
        try {
          const result = await this.upsertCandidate(decision.candidate, options.area)
          if (result === 'inserted') insertedCount += 1
          else updatedCount += 1
          await this.db.destinationImportJob.update({
            where: { id: job.id },
            data: { cursor: index + 1, processedRecords: { increment: 1 } },
          })
        } catch (error) {
          failedCount += 1
          errorSummary = error instanceof Error ? error.message : String(error)
          await this.db.destinationImportJob.update({
            where: { id: job.id },
            data: { cursor: index + 1, failedRecords: { increment: 1 } },
          })
        }
      }
      await this.db.destinationImportJob.update({
        where: { id: job.id },
        data: {
          totalRecords: selectedDecisions.length,
          skippedRecords: skippedCount,
          status: failedCount > 0 ? 'FAILED' : 'COMPLETED',
          errorMessage: errorSummary,
          completedAt: new Date(),
        },
      })
    }

    const categoryDistribution = emptyDistribution()
    const osmObjectTypeDistribution = emptyDistribution()
    const rejectionReasonDistribution = emptyDistribution()
    const reviewReasonDistribution = emptyDistribution()
    const duplicateDecisionDistribution = emptyDistribution()
    for (const decision of selectedDecisions) {
      increment(categoryDistribution, decision.candidate.category)
      increment(osmObjectTypeDistribution, decision.candidate.sourceObjectType ?? 'unknown')
      increment(duplicateDecisionDistribution, decision.duplicateDecision)
    }
    const acceptedNew = selectedDecisions.filter((decision) => {
      return decision.duplicateDecision === 'new' && decision.importReadiness.status === 'accepted'
    })
    const manualReview = selectedDecisions.filter((decision) => {
      return (
        decision.duplicateDecision === 'new' &&
        (decision.importReadiness.status === 'review' || decision.proposedAction === 'review')
      )
    })
    const rejectedNew = selectedDecisions.filter((decision) => {
      return decision.duplicateDecision === 'new' && decision.importReadiness.status === 'rejected'
    })
    const duplicates = selectedDecisions.filter((decision) => decision.duplicateDecision !== 'new')
    const existingExactMatches = selectedDecisions.filter((decision) => {
      return decision.duplicateDecision === 'exact_duplicate' && hasExistingDatabaseMatch(decision)
    })
    const existingNoChange = existingExactMatches.filter((decision) => !hasProposedChanges(decision))
    const safeUpdates = selectedDecisions.filter((decision) => decision.proposedAction === 'update')
    for (const decision of rejectedNew) {
      for (const reason of decision.importReadiness.reasons) increment(rejectionReasonDistribution, reason)
    }
    for (const decision of manualReview) {
      for (const reason of decision.importReadiness.reasons) increment(reviewReasonDistribution, reason)
    }
    const totalDecisions = selectedDecisions.length
    const hasEnglishName = selectedDecisions.filter((decision) => Boolean(decision.candidate.names.english)).length
    const hasWikidata = selectedDecisions.filter((decision) => Boolean(decision.candidate.wikidataId)).length
    const hasWebsite = selectedDecisions.filter((decision) => Boolean(decision.candidate.websiteUrl)).length
    const hasImage = selectedDecisions.filter((decision) => Boolean(decision.candidate.imageUrl)).length
    const hasLicensedImage = selectedDecisions.filter((decision) =>
      Boolean(decision.candidate.imageUrl && decision.candidate.imageLicense && decision.candidate.imageAttribution)
    ).length
    const summary = {
      discovered: rawCandidates.length,
      normalized: rawCandidates.length,
      acceptedNew: acceptedNew.length,
      manualReview: manualReview.length,
      rejectedNew: rejectedNew.length,
      existingExactMatches: existingExactMatches.length,
      existingNoChange: existingNoChange.length,
      safeUpdates: safeUpdates.length,
      probableDuplicates: selectedDecisions.filter((decision) => decision.duplicateDecision === 'probable_duplicate')
        .length,
      possibleDuplicates: selectedDecisions.filter((decision) => decision.duplicateDecision === 'possible_duplicate')
        .length,
      conflicts: selectedDecisions.filter((decision) => decision.duplicateDecision === 'conflict').length,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
    }

    return {
      jobId,
      area: areaSummary(options.area),
      provider: options.provider,
      dryRun: options.dryRun,
      stages: [...stages, ...(options.commit ? ['upsert' as const] : [])],
      summary,
      requestCount: this.httpClient.getRequestCount(),
      discoveredCount: rawCandidates.length,
      normalizedCount: rawCandidates.length,
      acceptedCount: acceptedNew.length,
      reviewCount: manualReview.length,
      rejectedCount: rejectedNew.length,
      duplicateCount: duplicates.length,
      insertedCount,
      updatedCount,
      skippedCount,
      failedCount,
      categoryDistribution,
      osmObjectTypeDistribution,
      rejectionReasonDistribution,
      reviewReasonDistribution,
      duplicateDecisionDistribution,
      localNameOnlyCount: selectedDecisions.filter((decision) => !decision.candidate.names.english).length,
      englishNameCoverage: coverage(hasEnglishName, totalDecisions),
      wikidataCoverage: coverage(hasWikidata, totalDecisions),
      websiteCoverage: coverage(hasWebsite, totalDecisions),
      imageCoverage: coverage(hasImage, totalDecisions),
      licensedImageCoverage: coverage(hasLicensedImage, totalDecisions),
      outsideBoundaryCandidates: selectedDecisions
        .filter((decision) => !isCoordinateInsideArea(options.area, decision.candidate.latitude, decision.candidate.longitude))
        .slice(0, 20)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          latitude: decision.candidate.latitude,
          longitude: decision.candidate.longitude,
        })),
      ambiguousLocalityCandidates: selectedDecisions
        .filter((decision) => localityMismatch(decision.candidate, options.area))
        .slice(0, 20)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          locality: decision.candidate.locality,
        })),
      multipleStrongIdentitySignalCandidates: selectedDecisions
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          signals: strongIdentitySignals(decision.candidate),
        }))
        .filter((candidate) => candidate.signals.length >= 2)
        .slice(0, 20),
      candidateSourceIds: selectedDecisions.map((decision) => decision.candidate.sourceRecordId),
      localityMismatches: selectedDecisions
        .filter((decision) => localityMismatch(decision.candidate, options.area))
        .slice(0, 10)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          locality: decision.candidate.locality,
        })),
      missingSourceIds: selectedDecisions
        .filter((decision) => !decision.candidate.sourceRecordId)
        .map((decision) => ({ name: decision.candidate.name })),
      unsupportedCategories: selectedDecisions
        .filter((decision) => decision.validationReasons.includes('UNSUPPORTED_CATEGORY'))
        .slice(0, 10)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          category: decision.candidate.category,
        })),
      imageLicenseFailures: selectedDecisions
        .filter((decision) =>
          decision.validationReasons.some((reason) => reason === 'IMAGE_LICENSE_UNSUPPORTED' || reason === 'IMAGE_ATTRIBUTION_INCOMPLETE')
        )
        .slice(0, 10)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          reasons: decision.validationReasons,
        })),
      proposedInserts: selectedDecisions
        .filter((decision) => decision.proposedAction === 'insert')
        .slice(0, 10)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          category: decision.candidate.category,
          score: decision.importReadiness.score,
        })),
      proposedUpdates: selectedDecisions
        .filter((decision) => decision.proposedAction === 'update' && decision.duplicateOf)
        .slice(0, 10)
        .map((decision) => ({
          sourceRecordId: decision.candidate.sourceRecordId,
          name: decision.candidate.name,
          duplicateOf: decision.duplicateOf as string,
          score: decision.importReadiness.score,
          fieldsThatWouldChange: decision.proposedFieldChanges ?? [],
          fieldsProtected: decision.protectedFields ?? [],
        })),
      acceptedExamples: acceptedNew.slice(0, 5),
      reviewExamples: manualReview.slice(0, 10),
      rejectedExamples: rejectedNew.slice(0, 5),
      duplicateDiagnostics: duplicates.slice(0, 10),
      decisions: selectedDecisions,
      diagnosticsFilePath: null,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      errorSummary,
    }
  }
}
