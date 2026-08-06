import { describe, expect, it } from 'vitest'

import {
  buildTravelSelectionFingerprint,
  TRAVEL_SELECTION_FINGERPRINT_VERSION,
} from '@/services/travel/persistence/travelSelectionFingerprint'

const base = {
  destination: 'Phu Quoc',
  originAirportCode: 'KUL',
  destinationAirportCode: 'PQC',
  outboundDate: '2026-09-12',
  returnDate: '2026-09-15',
  travellers: 2,
  rooms: 1,
  cabinClass: 'ECONOMY',
  currency: 'MYR',
  provider: 'mock' as const,
}

describe('travel selection fingerprint', () => {
  it('is deterministic, normalized, versioned, and contains no input values', () => {
    const first = buildTravelSelectionFingerprint(base)
    const second = buildTravelSelectionFingerprint({
      ...base,
      destination: '  PHU QUOC ',
      originAirportCode: 'kul',
      currency: 'myr',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toContain('KUL')
    expect(TRAVEL_SELECTION_FINGERPRINT_VERSION).toBe(1)
  })

  it.each([
    ['destination', { destination: 'Bangkok' }],
    ['origin airport', { originAirportCode: 'SIN' }],
    ['destination airport', { destinationAirportCode: 'BKK' }],
    ['outbound date', { outboundDate: '2026-09-13' }],
    ['return date', { returnDate: '2026-09-16' }],
    ['travellers', { travellers: 3 }],
    ['rooms', { rooms: 2 }],
    ['cabin class', { cabinClass: 'BUSINESS' }],
    ['currency', { currency: 'USD' }],
  ])('changes when %s changes', (_field, change) => {
    expect(buildTravelSelectionFingerprint({ ...base, ...change })).not.toBe(
      buildTravelSelectionFingerprint(base)
    )
  })
})
