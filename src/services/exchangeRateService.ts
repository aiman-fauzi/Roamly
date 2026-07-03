import { Decimal } from '@prisma/client/runtime/library'

import { prisma } from '@/db/client'

const FRANKFURTER_API_BASE = 'https://api.frankfurter.dev'
const RATE_SOURCE = 'frankfurter'

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface ExchangeRateResult {
  baseCurrency: string
  quoteCurrency: string
  rate: number
  source: string
  fetchedAt: Date
  fromCache: boolean
}

interface ResolveExchangeRateOptions {
  baseCurrency: string
  quoteCurrency: string
  fetcher?: Fetcher
}

export class ExchangeRateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExchangeRateError'
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase()
}

function decimalToNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  return Number(value)
}

async function readCachedRate(baseCurrency: string, quoteCurrency: string) {
  return prisma.exchangeRate.findUnique({
    where: {
      baseCurrency_quoteCurrency: {
        baseCurrency,
        quoteCurrency,
      },
    },
  })
}

export function inferDestinationCurrency(destination: string, userCurrency: string): string {
  const normalized = destination.toLowerCase()
  const rules: Array<{ currency: string; terms: string[] }> = [
    { currency: 'MYR', terms: ['malaysia', 'kuala lumpur', 'penang', 'langkawi'] },
    { currency: 'JPY', terms: ['japan', 'tokyo', 'kyoto', 'osaka'] },
    {
      currency: 'USD',
      terms: ['united states', 'usa', 'new york', 'los angeles', 'san francisco'],
    },
    { currency: 'GBP', terms: ['united kingdom', 'uk', 'london', 'manchester', 'edinburgh'] },
    { currency: 'AUD', terms: ['australia', 'sydney', 'melbourne', 'brisbane'] },
  ]

  return rules.find((rule) => rule.terms.some((term) => normalized.includes(term)))?.currency ?? userCurrency
}

export async function resolveExchangeRate({
  baseCurrency,
  quoteCurrency,
  fetcher = fetch,
}: ResolveExchangeRateOptions): Promise<ExchangeRateResult> {
  const base = normalizeCurrency(baseCurrency)
  const quote = normalizeCurrency(quoteCurrency)

  if (base === quote) {
    return {
      baseCurrency: base,
      quoteCurrency: quote,
      rate: 1,
      source: 'same_currency',
      fetchedAt: new Date(),
      fromCache: false,
    }
  }

  try {
    const response = await fetcher(`${FRANKFURTER_API_BASE}/v2/rate/${base}/${quote}`)
    if (!response.ok) throw new Error(`Exchange-rate lookup failed with ${response.status}`)

    const data = (await response.json()) as { rate?: unknown; date?: unknown }
    const rate = typeof data.rate === 'number' ? data.rate : Number(data.rate)
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Exchange-rate response did not contain a valid rate.')
    }

    const fetchedAt =
      typeof data.date === 'string' ? new Date(`${data.date}T00:00:00.000Z`) : new Date()

    await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: base,
          quoteCurrency: quote,
        },
      },
      update: {
		  rate: new Decimal(rate),
		  source: RATE_SOURCE,
		  fetchedAt,
	  },
	  create: {
		  baseCurrency: base,
		  quoteCurrency: quote,
		  rate: new Decimal(rate),
		  source: RATE_SOURCE,
		  fetchedAt,
	  },
    })

    return {
      baseCurrency: base,
      quoteCurrency: quote,
      rate,
      source: RATE_SOURCE,
      fetchedAt,
      fromCache: false,
    }
  } catch {
    const cached = await readCachedRate(base, quote)
    if (!cached) {
      throw new ExchangeRateError(
        `Exchange rate unavailable for ${base} to ${quote}. Please try again later.`
      )
    }

    return {
      baseCurrency: cached.baseCurrency,
      quoteCurrency: cached.quoteCurrency,
      rate: decimalToNumber(cached.rate),
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
    }
  }
}
