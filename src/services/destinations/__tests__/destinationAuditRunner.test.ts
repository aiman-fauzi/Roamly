import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runDestinationAuditCli } from '@/services/destinations/runDestinationAudit'

const summary = {
  cityId: 'city-1',
  cityName: 'Kuala Lumpur',
  activeEntities: { ATTRACTION: 7, RESTAURANT: 8, HOTEL: 1, ACTIVITY: 1 },
  quarantinedEntities: { ATTRACTION: 9, RESTAURANT: 0, HOTEL: 0, ACTIVITY: 0 },
  totalActiveEntities: 17,
  verifiedOpeningHours: 1,
  verifiedOpeningHoursCoverage: 6,
  verifiedTicketPrices: 1,
  verifiedTicketPriceCoverage: 6,
  staleFacts: 0,
  conflictingFacts: 0,
  missingCoordinates: 0,
  missingSourceUrls: 7,
  possibleDuplicates: 0,
  geminiEnriched: 2,
  geminiEnrichedCoverage: 12,
}

describe('destination audit CLI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('prints a text audit summary for a city', async () => {
    const auditCity = vi.fn().mockResolvedValue(summary)

    const exitCode = await runDestinationAuditCli(['--city=Kuala Lumpur'], {
      service: { auditCity },
    })

    expect(exitCode).toBe(0)
    expect(auditCity).toHaveBeenCalledWith('Kuala Lumpur')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('verified opening-hours coverage'))
  })

  it('supports JSON output for automation', async () => {
    const auditCity = vi.fn().mockResolvedValue(summary)

    const exitCode = await runDestinationAuditCli(['--city=Kuala Lumpur', '--json'], {
      service: { auditCity },
    })

    expect(exitCode).toBe(0)
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(summary, null, 2))
  })
})
