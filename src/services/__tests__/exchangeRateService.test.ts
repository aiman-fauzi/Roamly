import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exchangeRateFindUnique: vi.fn(),
  exchangeRateUpsert: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  prisma: {
    exchangeRate: {
      findUnique: mocks.exchangeRateFindUnique,
      upsert: mocks.exchangeRateUpsert,
    },
  },
}))

import {
  ExchangeRateError,
  inferDestinationCurrency,
  resolveExchangeRate,
} from '@/services/exchangeRateService'

describe('exchangeRateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a same-currency rate without live lookup', async () => {
    const fetcher = vi.fn()

    await expect(
      resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'MYR', fetcher })
    ).resolves.toMatchObject({
      baseCurrency: 'MYR',
      quoteCurrency: 'MYR',
      rate: 1,
      source: 'same_currency',
      fromCache: false,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('caches a successful live rate', async () => {
    const fetchedAt = new Date('2026-07-03T00:00:00.000Z')
    const fetcher = vi.fn(async () =>
      Response.json({
        rate: 0.21,
        date: '2026-07-03',
      })
    )
    vi.setSystemTime(fetchedAt)

    const rate = await resolveExchangeRate({
      baseCurrency: 'MYR',
      quoteCurrency: 'USD',
      fetcher,
    })

    expect(rate).toMatchObject({
      baseCurrency: 'MYR',
      quoteCurrency: 'USD',
      rate: 0.21,
      source: 'frankfurter',
      fromCache: false,
    })
    expect(mocks.exchangeRateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { baseCurrency_quoteCurrency: { baseCurrency: 'MYR', quoteCurrency: 'USD' } },
      })
    )
    vi.useRealTimers()
  })

  it('uses cached rate when live lookup fails', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }))
    mocks.exchangeRateFindUnique.mockResolvedValue({
      baseCurrency: 'MYR',
      quoteCurrency: 'USD',
      rate: { toNumber: () => 0.2 },
      source: 'frankfurter',
      fetchedAt: new Date('2026-07-02T00:00:00.000Z'),
    })

    await expect(
      resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'USD', fetcher })
    ).resolves.toMatchObject({
      rate: 0.2,
      fromCache: true,
    })
  })

  it('fails when live and cached rates are unavailable', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }))
    mocks.exchangeRateFindUnique.mockResolvedValue(null)

    await expect(
      resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'USD', fetcher })
    ).rejects.toBeInstanceOf(ExchangeRateError)
  })

  it('infers common destination currencies without inventing unknown currencies', () => {
    expect(inferDestinationCurrency('Penang, Malaysia', 'USD')).toBe('MYR')
    expect(inferDestinationCurrency('Kyoto, Japan', 'MYR')).toBe('JPY')
    expect(inferDestinationCurrency('Somewhere new', 'AUD')).toBe('AUD')
  })
})
