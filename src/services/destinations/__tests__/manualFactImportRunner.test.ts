import { DestinationFactType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseManualFactImportArgs,
  runManualFactImportCli,
} from '@/services/destinations/facts/manualFactImportRunner'

const validFile = JSON.stringify({
  facts: [
    {
      entityType: 'ATTRACTION',
      entityId: 'attraction-1',
      factType: 'OPENING_HOURS',
      rawValue: 'Mo-Fr 09:00-17:00; Sa-Su 10:00-16:00',
      sourceKey: 'trusted-manual-travel-listing',
      sourceUrl: 'https://malaysialife.org/national-mosque-in-kuala-lumpur/',
      sourceRecordId: 'manual:national-mosque:hours',
      sourceTier: 'TRUSTED_TRAVEL_LISTING',
      confidence: 80,
      retrievedAt: '2026-08-04T00:00:00.000Z',
      verifiedAt: '2026-08-04T00:00:00.000Z',
      parserVersion: 'manual-test-v1',
    },
    {
      entityType: 'ATTRACTION',
      entityId: 'attraction-1',
      factType: 'TICKET_PRICE',
      rawValue: 'Free',
      currency: 'MYR',
      sourceKey: 'trusted-manual-travel-listing',
      sourceUrl: 'https://malaysialife.org/national-mosque-in-kuala-lumpur/',
      sourceRecordId: 'manual:national-mosque:price',
      sourceTier: 'TRUSTED_TRAVEL_LISTING',
      confidence: 80,
      retrievedAt: '2026-08-04T00:00:00.000Z',
      verifiedAt: '2026-08-04T00:00:00.000Z',
      parserVersion: 'manual-test-v1',
    },
  ],
})

function dbMock(active = true) {
  return {
    attraction: {
      findFirst: vi.fn().mockResolvedValue(active ? { id: 'attraction-1', name: 'National Mosque' } : null),
    },
    restaurant: { findFirst: vi.fn() },
    hotel: { findFirst: vi.fn() },
    activity: { findFirst: vi.fn() },
  }
}

function serviceMock() {
  return {
    upsertSourceFact: vi.fn().mockResolvedValue({ id: 'fact-1' }),
    resolveEffectiveFact: vi.fn().mockResolvedValue(null),
  }
}

describe('manual destination fact import runner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('defaults to dry-run and parses apply mode explicitly', () => {
    expect(parseManualFactImportArgs(['--file=./facts.json'])).toEqual({
      file: './facts.json',
      apply: false,
    })
    expect(parseManualFactImportArgs(['--file=./facts.json', '--apply'])).toEqual({
      file: './facts.json',
      apply: true,
    })
  })

  it('validates facts in dry-run without writing them', async () => {
    const service = serviceMock()

    const exitCode = await runManualFactImportCli(['--file=./facts.json'], {
      db: dbMock() as never,
      service,
      readTextFile: vi.fn().mockResolvedValue(validFile),
    })

    expect(exitCode).toBe(0)
    expect(service.resolveEffectiveFact).toHaveBeenCalledWith(
      { entityType: 'ATTRACTION', entityId: 'attraction-1' },
      DestinationFactType.OPENING_HOURS
    )
    expect(service.upsertSourceFact).not.toHaveBeenCalled()
  })

  it('applies validated facts only with --apply', async () => {
    const service = serviceMock()

    const exitCode = await runManualFactImportCli(['--file=./facts.json', '--apply'], {
      db: dbMock() as never,
      service,
      readTextFile: vi.fn().mockResolvedValue(validFile),
    })

    expect(exitCode).toBe(0)
    expect(service.upsertSourceFact).toHaveBeenCalledTimes(2)
  })

  it('refuses unknown fact types', async () => {
    const file = JSON.stringify({
      facts: [{ ...JSON.parse(validFile).facts[0], factType: 'MADE_UP_FACT' }],
    })

    const exitCode = await runManualFactImportCli(['--file=./facts.json'], {
      db: dbMock() as never,
      service: serviceMock(),
      readTextFile: vi.fn().mockResolvedValue(file),
    })

    expect(exitCode).toBe(1)
  })

  it('refuses quarantined or missing entities', async () => {
    const service = serviceMock()

    const exitCode = await runManualFactImportCli(['--file=./facts.json', '--apply'], {
      db: dbMock(false) as never,
      service,
      readTextFile: vi.fn().mockResolvedValue(validFile),
    })

    expect(exitCode).toBe(1)
    expect(service.upsertSourceFact).not.toHaveBeenCalled()
  })
})
