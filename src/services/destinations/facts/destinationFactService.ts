import { createHash } from 'node:crypto'

import {
  DestinationFactEntityType,
  DestinationFactSourceTier,
  DestinationFactStatus,
  DestinationFactType,
  type DestinationFact,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'

import { prisma } from '@/db/client'

export type EffectiveFactStatus = 'VERIFIED' | 'PARTIAL' | 'STALE' | 'UNKNOWN'

export interface DestinationEntityRef {
  entityType: DestinationFactEntityType
  entityId: string
}

export interface UpsertDestinationFactInput extends DestinationEntityRef {
  factType: DestinationFactType
  normalizedValue: Prisma.InputJsonValue
  rawValue?: Prisma.InputJsonValue
  currency?: string | null
  sourceKey: string
  sourceUrl?: string | null
  sourceRecordId?: string | null
  sourceTier: DestinationFactSourceTier
  confidence?: number
  retrievedAt: Date
  verifiedAt?: Date | null
  expiresAt?: Date | null
  parserVersion?: string | null
  status?: DestinationFactStatus
}

export interface EffectiveDestinationFact {
  fact: DestinationFact
  value: Prisma.JsonValue
  status: EffectiveFactStatus
  stale: boolean
  conflicts: DestinationFact[]
}

export interface EffectiveFactBundle {
  entityType: DestinationFactEntityType
  entityId: string
  facts: Partial<Record<DestinationFactType, EffectiveDestinationFact>>
}

type FactTransactionClient = Prisma.TransactionClient | PrismaClient

const SOURCE_PRIORITY: Record<DestinationFactSourceTier, number> = {
  OFFICIAL_SOURCE: 5,
  GOVERNMENT_OPEN_DATA: 4,
  OPENSTREETMAP_STRUCTURED: 3,
  TRUSTED_TRAVEL_LISTING: 2,
  GEMINI_DERIVED: 1,
}

const VALID_EFFECTIVE_STATUSES = new Set<DestinationFactStatus>([
  DestinationFactStatus.ACTIVE,
  DestinationFactStatus.STALE,
])

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`
}

export function buildDestinationFactFingerprint(input: UpsertDestinationFactInput): string {
  const payload = [
    input.entityType,
    input.entityId,
    input.factType,
    input.sourceKey,
    input.sourceRecordId ?? '',
    input.sourceUrl ?? '',
    input.parserVersion ?? '',
    stableJson(input.normalizedValue),
  ].join('|')

  return createHash('sha256').update(payload).digest('hex')
}

function effectiveKey(ref: DestinationEntityRef, factType: DestinationFactType): string {
  return `${ref.entityType}:${ref.entityId}:${factType}`
}

function timestampScore(value?: Date | null): number {
  return value?.getTime() ?? 0
}

function isExpired(fact: Pick<DestinationFact, 'expiresAt' | 'status'>, now: Date): boolean {
  return fact.status === DestinationFactStatus.STALE || Boolean(fact.expiresAt && fact.expiresAt <= now)
}

function isAuthoritativeForFactType(fact: DestinationFact): boolean {
  if (
    fact.sourceTier === DestinationFactSourceTier.GEMINI_DERIVED &&
    (fact.factType === DestinationFactType.OPENING_HOURS || fact.factType === DestinationFactType.TICKET_PRICE)
  ) {
    return false
  }
  return true
}

function effectiveStatus(fact: DestinationFact, now: Date): EffectiveFactStatus {
  if (isExpired(fact, now)) return 'STALE'
  if (fact.verifiedAt) return 'VERIFIED'
  return 'PARTIAL'
}

function compareFacts(first: DestinationFact, second: DestinationFact, now: Date): number {
  const priorityDelta = SOURCE_PRIORITY[second.sourceTier] - SOURCE_PRIORITY[first.sourceTier]
  if (priorityDelta !== 0) return priorityDelta

  const staleDelta = Number(isExpired(first, now)) - Number(isExpired(second, now))
  if (staleDelta !== 0) return staleDelta

  const verifiedDelta = Number(Boolean(second.verifiedAt)) - Number(Boolean(first.verifiedAt))
  if (verifiedDelta !== 0) return verifiedDelta

  const verifiedTimeDelta = timestampScore(second.verifiedAt) - timestampScore(first.verifiedAt)
  if (verifiedTimeDelta !== 0) return verifiedTimeDelta

  const retrievedDelta = timestampScore(second.retrievedAt) - timestampScore(first.retrievedAt)
  if (retrievedDelta !== 0) return retrievedDelta

  const confidenceDelta = second.confidence - first.confidence
  if (confidenceDelta !== 0) return confidenceDelta

  return first.id.localeCompare(second.id)
}

export function selectEffectiveDestinationFact(
  facts: DestinationFact[],
  now: Date = new Date()
): EffectiveDestinationFact | null {
  const eligible = facts
    .filter((fact) => VALID_EFFECTIVE_STATUSES.has(fact.status))
    .filter((fact) => isAuthoritativeForFactType(fact))
    .sort((first, second) => compareFacts(first, second, now))

  const selected = eligible[0]
  if (!selected) return null

  return {
    fact: selected,
    value: selected.normalizedValue,
    status: effectiveStatus(selected, now),
    stale: isExpired(selected, now),
    conflicts: eligible.slice(1),
  }
}

async function readActiveEntity(
  db: FactTransactionClient,
  ref: DestinationEntityRef
): Promise<{ id: string } | null> {
  const where = {
    id: ref.entityId,
    deletedAt: null,
    city: { deletedAt: null, country: { deletedAt: null } },
  }

  if (ref.entityType === DestinationFactEntityType.ATTRACTION) {
    return db.attraction.findFirst({ where, select: { id: true } })
  }
  if (ref.entityType === DestinationFactEntityType.RESTAURANT) {
    return db.restaurant.findFirst({ where, select: { id: true } })
  }
  if (ref.entityType === DestinationFactEntityType.HOTEL) {
    return db.hotel.findFirst({ where, select: { id: true } })
  }
  return db.activity.findFirst({ where, select: { id: true } })
}

export class DestinationFactService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async upsertSourceFact(input: UpsertDestinationFactInput): Promise<DestinationFact> {
    const fingerprint = buildDestinationFactFingerprint(input)
    const confidence = Math.max(0, Math.min(100, Math.round(input.confidence ?? 100)))

    return this.db.$transaction(async (tx) => {
      const activeEntity = await readActiveEntity(tx, input)
      if (!activeEntity) {
        throw new Error(`${input.entityType}:${input.entityId} is not an active destination entity.`)
      }

      return tx.destinationFact.upsert({
        where: { fingerprint },
        update: {
          currency: input.currency?.toUpperCase() ?? null,
          sourceUrl: input.sourceUrl ?? null,
          sourceRecordId: input.sourceRecordId ?? null,
          confidence,
          retrievedAt: input.retrievedAt,
          verifiedAt: input.verifiedAt ?? null,
          expiresAt: input.expiresAt ?? null,
          parserVersion: input.parserVersion ?? null,
          status: input.status ?? DestinationFactStatus.ACTIVE,
        },
        create: {
          entityType: input.entityType,
          entityId: input.entityId,
          factType: input.factType,
          normalizedValue: input.normalizedValue,
          rawValue: input.rawValue,
          currency: input.currency?.toUpperCase() ?? null,
          sourceKey: input.sourceKey,
          sourceUrl: input.sourceUrl ?? null,
          sourceRecordId: input.sourceRecordId ?? null,
          sourceTier: input.sourceTier,
          confidence,
          retrievedAt: input.retrievedAt,
          verifiedAt: input.verifiedAt ?? null,
          expiresAt: input.expiresAt ?? null,
          parserVersion: input.parserVersion ?? null,
          status: input.status ?? DestinationFactStatus.ACTIVE,
          fingerprint,
        },
      })
    })
  }

  async listEntityFacts(ref: DestinationEntityRef): Promise<DestinationFact[]> {
    return this.db.destinationFact.findMany({
      where: ref,
      orderBy: [{ factType: 'asc' }, { sourceTier: 'desc' }, { verifiedAt: 'desc' }, { retrievedAt: 'desc' }],
    })
  }

  async auditFactHistory(ref: DestinationEntityRef): Promise<DestinationFact[]> {
    return this.listEntityFacts(ref)
  }

  async resolveEffectiveFact(
    ref: DestinationEntityRef,
    factType: DestinationFactType,
    now: Date = new Date()
  ): Promise<EffectiveDestinationFact | null> {
    const facts = await this.db.destinationFact.findMany({
      where: {
        ...ref,
        factType,
        status: { in: [DestinationFactStatus.ACTIVE, DestinationFactStatus.STALE] },
      },
    })
    return selectEffectiveDestinationFact(facts, now)
  }

  async resolveEffectiveFactsForEntities(
    refs: DestinationEntityRef[],
    factTypes?: DestinationFactType[],
    now: Date = new Date()
  ): Promise<Map<string, EffectiveDestinationFact>> {
    if (refs.length === 0) return new Map()

    const uniqueRefs = [...new Map(refs.map((ref) => [`${ref.entityType}:${ref.entityId}`, ref])).values()]
    const facts = await this.db.destinationFact.findMany({
      where: {
        OR: uniqueRefs.map((ref) => ({ entityType: ref.entityType, entityId: ref.entityId })),
        factType: factTypes ? { in: factTypes } : undefined,
        status: { in: [DestinationFactStatus.ACTIVE, DestinationFactStatus.STALE] },
      },
    })

    const grouped = new Map<string, DestinationFact[]>()
    for (const fact of facts) {
      const key = effectiveKey(fact, fact.factType)
      grouped.set(key, [...(grouped.get(key) ?? []), fact])
    }

    const selected = new Map<string, EffectiveDestinationFact>()
    for (const [key, scopedFacts] of grouped) {
      const effective = selectEffectiveDestinationFact(scopedFacts, now)
      if (effective) selected.set(key, effective)
    }
    return selected
  }

  async resolveEffectiveFactsForEntity(
    ref: DestinationEntityRef,
    factTypes?: DestinationFactType[],
    now: Date = new Date()
  ): Promise<EffectiveFactBundle> {
    const selected = await this.resolveEffectiveFactsForEntities([ref], factTypes, now)
    const facts: EffectiveFactBundle['facts'] = {}
    for (const factType of Object.values(DestinationFactType)) {
      const fact = selected.get(effectiveKey(ref, factType))
      if (fact) facts[factType] = fact
    }
    return { ...ref, facts }
  }

  async markFactStale(factId: string): Promise<DestinationFact> {
    return this.db.destinationFact.update({
      where: { id: factId },
      data: { status: DestinationFactStatus.STALE },
    })
  }

  async invalidateFact(
    factId: string,
    status:
      | typeof DestinationFactStatus.INVALID
      | typeof DestinationFactStatus.REJECTED = DestinationFactStatus.INVALID
  ): Promise<DestinationFact> {
    return this.db.destinationFact.update({
      where: { id: factId },
      data: { status },
    })
  }
}

export function destinationFactKey(
  ref: DestinationEntityRef,
  factType: DestinationFactType
): string {
  return effectiveKey(ref, factType)
}
