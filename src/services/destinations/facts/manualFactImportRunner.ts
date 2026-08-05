import { readFile } from 'node:fs/promises'

import {
  DestinationFactEntityType,
  DestinationFactSourceTier,
  DestinationFactStatus,
  DestinationFactType,
  type PrismaClient,
} from '@prisma/client'

import { prisma } from '@/db/client'
import {
  DestinationFactService,
  type UpsertDestinationFactInput,
} from '@/services/destinations/facts/destinationFactService'
import {
  parseOpeningHoursFact,
  parseStructuredPrices,
} from '@/services/destinations/facts/parsers'
import { assertSourcePolicyAllowsUrl } from '@/services/destinations/facts/sourcePolicy'
import { DEFAULT_STALE_THRESHOLDS } from '@/services/destinations/facts/staleness'
import type { StructuredOpeningHours, StructuredPrice } from '@/services/destinations/facts/types'

interface ManualFactImportArgs {
  file: string
  apply: boolean
}

interface ManualFactImportOptions {
  db?: PrismaClient
  service?: Pick<DestinationFactService, 'upsertSourceFact' | 'resolveEffectiveFact'>
  readTextFile?: (path: string) => Promise<string>
}

interface ManualFactInput {
  entityType: string
  entityId: string
  factType: string
  rawValue?: unknown
  normalizedValue?: unknown
  currency?: string
  sourceKey: string
  sourceUrl?: string
  sourceRecordId?: string
  sourceTier: string
  confidence?: number
  retrievedAt: string
  verifiedAt?: string
  expiresAt?: string
  parserVersion?: string
}

interface ManualFactFile {
  facts?: ManualFactInput[]
}

export interface ManualFactImportSummary {
  mode: 'dry-run' | 'apply'
  proposed: number
  applied: number
  skipped: number
  failed: number
  conflicts: number
  errors: string[]
}

const FACT_EXPIRY_DAYS: Record<DestinationFactType, number> = {
  OPENING_HOURS: DEFAULT_STALE_THRESHOLDS.openingHoursDays,
  TICKET_PRICE: DEFAULT_STALE_THRESHOLDS.ticketPricesDays,
  ADDRESS: DEFAULT_STALE_THRESHOLDS.addressCoordinatesDays,
  COORDINATES: DEFAULT_STALE_THRESHOLDS.addressCoordinatesDays,
  OFFICIAL_URL: DEFAULT_STALE_THRESHOLDS.descriptionTagsDays,
  OPERATIONAL_STATUS: DEFAULT_STALE_THRESHOLDS.openingHoursDays,
  VISIT_DURATION: DEFAULT_STALE_THRESHOLDS.descriptionTagsDays,
  DESCRIPTION_TAGS: DEFAULT_STALE_THRESHOLDS.descriptionTagsDays,
}

function readOption(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`
  const inlineValue = argv.find((arg) => arg.startsWith(inlinePrefix))?.slice(inlinePrefix.length)
  if (inlineValue !== undefined) return inlineValue
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

export function parseManualFactImportArgs(argv: string[]): ManualFactImportArgs {
  const file = readOption(argv, 'file')
  if (!file) throw new Error('Pass --file=<path-to-verified-facts.json>.')

  const apply = hasFlag(argv, 'apply')
  const dryRun = hasFlag(argv, 'dry-run')
  if (apply && dryRun) throw new Error('Pass either --dry-run or --apply, not both.')

  return { file, apply }
}

function parseEnumValue<T extends Record<string, string>>(
  enumObject: T,
  value: string,
  label: string
): T[keyof T] {
  if (Object.values(enumObject).includes(value)) return value as T[keyof T]
  throw new Error(`Unknown ${label}: ${value}`)
}

function parseTimestamp(value: string | undefined, label: string, required = false): Date | null {
  if (!value) {
    if (required) throw new Error(`${label} is required.`)
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be an ISO timestamp.`)
  return parsed
}

function validateCurrency(value?: string | null): string | null {
  if (value == null || value === '') return null
  const normalized = value.toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error(`Currency must be a three-letter ISO code: ${value}`)
  return normalized
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000)
}

function readStringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`)
  return value.trim()
}

function normalizeOpeningHoursFact(input: ManualFactInput): StructuredOpeningHours {
  if (input.normalizedValue && typeof input.normalizedValue === 'object') {
    const value = input.normalizedValue as StructuredOpeningHours
    if (!Array.isArray(value.weekly)) throw new Error('OPENING_HOURS normalizedValue.weekly must be an array.')
    return value
  }

  const raw = readStringValue(input.rawValue, 'OPENING_HOURS rawValue')
  const parsed = parseOpeningHoursFact(raw, {
    sourceUrl: input.sourceUrl,
    verifiedAt: input.verifiedAt,
    timezone: 'Asia/Kuala_Lumpur',
  })
  if (!parsed.value || parsed.status === 'AMBIGUOUS' || parsed.status === 'UNSUPPORTED') {
    throw new Error(`OPENING_HOURS could not be safely parsed: ${parsed.reason ?? parsed.status}`)
  }
  return parsed.value
}

function normalizeTicketPriceFact(input: ManualFactInput): StructuredPrice[] {
  if (Array.isArray(input.normalizedValue)) return input.normalizedValue as StructuredPrice[]
  if (input.normalizedValue && typeof input.normalizedValue === 'object') return [input.normalizedValue as StructuredPrice]

  const raw = readStringValue(input.rawValue, 'TICKET_PRICE rawValue')
  const parsed = parseStructuredPrices(raw, {
    currency: validateCurrency(input.currency) ?? 'MYR',
    sourceUrl: input.sourceUrl,
    verifiedAt: input.verifiedAt,
  })
  if (parsed.values.length === 0 || parsed.status === 'AMBIGUOUS' || parsed.status === 'UNSUPPORTED') {
    throw new Error(`TICKET_PRICE could not be safely parsed: ${parsed.reason ?? parsed.status}`)
  }
  return parsed.values
}

function normalizeCoordinates(input: ManualFactInput): { latitude: number; longitude: number } {
  const value = input.normalizedValue
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COORDINATES normalizedValue must be an object.')
  }
  const latitude = (value as { latitude?: unknown }).latitude
  const longitude = (value as { longitude?: unknown }).longitude
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('COORDINATES normalizedValue must include numeric latitude and longitude.')
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('COORDINATES normalizedValue is outside valid latitude/longitude bounds.')
  }
  return { latitude, longitude }
}

function normalizeValue(input: ManualFactInput, factType: DestinationFactType): unknown {
  if (factType === DestinationFactType.OPENING_HOURS) return normalizeOpeningHoursFact(input)
  if (factType === DestinationFactType.TICKET_PRICE) return normalizeTicketPriceFact(input)
  if (factType === DestinationFactType.COORDINATES) return normalizeCoordinates(input)
  if (factType === DestinationFactType.OFFICIAL_URL) {
    const url = readStringValue(input.normalizedValue ?? input.rawValue, 'OFFICIAL_URL value')
    return new URL(url).toString()
  }
  if (factType === DestinationFactType.ADDRESS) return readStringValue(input.normalizedValue ?? input.rawValue, 'ADDRESS value')
  if (factType === DestinationFactType.OPERATIONAL_STATUS) {
    const value = readStringValue(input.normalizedValue ?? input.rawValue, 'OPERATIONAL_STATUS value')
    if (!['OPEN', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED', 'UNKNOWN'].includes(value)) {
      throw new Error(`Unsupported OPERATIONAL_STATUS: ${value}`)
    }
    return value
  }
  if (factType === DestinationFactType.VISIT_DURATION) {
    const value = input.normalizedValue ?? input.rawValue
    const minutes = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 720) {
      throw new Error('VISIT_DURATION must be an integer between 15 and 720 minutes.')
    }
    return { minutes }
  }
  return input.normalizedValue ?? input.rawValue
}

async function validateActiveEntity(db: PrismaClient, entityType: DestinationFactEntityType, entityId: string) {
  const where = {
    id: entityId,
    deletedAt: null,
    city: { deletedAt: null, country: { deletedAt: null } },
  }
  const entity =
    entityType === DestinationFactEntityType.ATTRACTION
      ? await db.attraction.findFirst({ where, select: { id: true, name: true } })
      : entityType === DestinationFactEntityType.RESTAURANT
        ? await db.restaurant.findFirst({ where, select: { id: true, name: true } })
        : entityType === DestinationFactEntityType.HOTEL
          ? await db.hotel.findFirst({ where, select: { id: true, name: true } })
          : await db.activity.findFirst({ where, select: { id: true, name: true } })

  if (!entity) throw new Error(`${entityType}:${entityId} is missing or quarantined.`)
  return entity
}

async function normalizeManualFact(
  input: ManualFactInput,
  db: PrismaClient
): Promise<UpsertDestinationFactInput> {
  const entityType = parseEnumValue(DestinationFactEntityType, input.entityType, 'entityType')
  const factType = parseEnumValue(DestinationFactType, input.factType, 'factType')
  const sourceTier = parseEnumValue(DestinationFactSourceTier, input.sourceTier, 'sourceTier')
  const retrievedAt = parseTimestamp(input.retrievedAt, 'retrievedAt', true) as Date
  const verifiedAt = parseTimestamp(input.verifiedAt, 'verifiedAt')
  const expiresAt = parseTimestamp(input.expiresAt, 'expiresAt') ?? addDays(verifiedAt ?? retrievedAt, FACT_EXPIRY_DAYS[factType])
  const currency = validateCurrency(input.currency)

  if (input.sourceUrl) {
    assertSourcePolicyAllowsUrl(input.sourceKey, input.sourceUrl, { allowManualImport: true })
  }
  await validateActiveEntity(db, entityType, input.entityId)

  return {
    entityType,
    entityId: input.entityId,
    factType,
    normalizedValue: normalizeValue(input, factType) as UpsertDestinationFactInput['normalizedValue'],
    rawValue: input.rawValue === undefined ? undefined : (input.rawValue as UpsertDestinationFactInput['rawValue']),
    currency,
    sourceKey: input.sourceKey,
    sourceUrl: input.sourceUrl ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    sourceTier,
    confidence: input.confidence ?? 100,
    retrievedAt,
    verifiedAt,
    expiresAt,
    parserVersion: input.parserVersion ?? 'manual-fact-v1',
    status: DestinationFactStatus.ACTIVE,
  }
}

function parseManualFactFile(text: string): ManualFactInput[] {
  const parsed = JSON.parse(text) as ManualFactFile
  if (!Array.isArray(parsed.facts)) throw new Error('Manual fact file must contain a facts array.')
  return parsed.facts
}

function printSummary(summary: ManualFactImportSummary) {
  console.warn('[facts:import] Summary')
  console.warn(`  mode: ${summary.mode}`)
  console.warn(`  proposed facts: ${summary.proposed}`)
  console.warn(`  applied facts: ${summary.applied}`)
  console.warn(`  skipped facts: ${summary.skipped}`)
  console.warn(`  failed facts: ${summary.failed}`)
  console.warn(`  conflicts: ${summary.conflicts}`)
  for (const error of summary.errors) console.warn(`  - ${error}`)
}

export async function runManualFactImportCli(
  argv: string[],
  options: ManualFactImportOptions = {}
): Promise<number> {
  const args = parseManualFactImportArgs(argv)
  const db = options.db ?? prisma
  const service = options.service ?? new DestinationFactService(db)
  const text = options.readTextFile
    ? await options.readTextFile(args.file)
    : await readFile(args.file, 'utf8')
  const rawFacts = parseManualFactFile(text)
  const summary: ManualFactImportSummary = {
    mode: args.apply ? 'apply' : 'dry-run',
    proposed: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    conflicts: 0,
    errors: [],
  }

  console.warn('[facts:import] Manual verified fact import starting')
  console.warn(`  file: ${args.file}`)
  console.warn(`  mode: ${summary.mode}`)

  for (const [index, rawFact] of rawFacts.entries()) {
    try {
      const fact = await normalizeManualFact(rawFact, db)
      const existing = await service.resolveEffectiveFact(
        { entityType: fact.entityType, entityId: fact.entityId },
        fact.factType
      )
      summary.proposed += 1
      if (existing) summary.conflicts += 1

      console.warn(
        `  - ${fact.entityType}:${fact.entityId} ${fact.factType} from ${fact.sourceKey}${existing ? ' (conflict/history)' : ''}`
      )

      if (args.apply) {
        await service.upsertSourceFact(fact)
        summary.applied += 1
      }
    } catch (error) {
      summary.failed += 1
      summary.errors.push(`facts[${index}]: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!args.apply) summary.skipped = summary.proposed
  printSummary(summary)
  return summary.failed > 0 ? 1 : 0
}
