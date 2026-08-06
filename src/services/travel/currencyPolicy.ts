const APPLICATION_FALLBACK_CURRENCY = 'USD'

const ORIGIN_AIRPORT_DEFAULT_CURRENCIES: Record<string, string> = {
  KUL: 'MYR',
}

const ORIGIN_COUNTRY_DEFAULT_CURRENCIES: Array<{ currency: string; terms: string[] }> = [
  { currency: 'MYR', terms: ['malaysia'] },
  { currency: 'SGD', terms: ['singapore'] },
  { currency: 'VND', terms: ['vietnam', 'viet nam'] },
  { currency: 'USD', terms: ['united states', 'usa'] },
]

export type TravelCurrencySource =
  | 'TRIP_SELECTED'
  | 'USER_PREFERRED'
  | 'ORIGIN_DEFAULT'
  | 'APPLICATION_FALLBACK'

export interface TravelCurrencyResolution {
  currency: string
  source: TravelCurrencySource
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

function originDefaultCurrency(input: {
  originAirportCode?: string | null
  originCountry?: string | null
}): string | null {
  const airportCode = input.originAirportCode?.trim().toUpperCase()
  if (airportCode && ORIGIN_AIRPORT_DEFAULT_CURRENCIES[airportCode]) {
    return ORIGIN_AIRPORT_DEFAULT_CURRENCIES[airportCode]
  }

  const originCountry = input.originCountry?.trim().toLowerCase()
  if (!originCountry) return null
  return (
    ORIGIN_COUNTRY_DEFAULT_CURRENCIES.find((rule) =>
      rule.terms.some((term) => originCountry.includes(term))
    )?.currency ?? null
  )
}

export function resolveTravelCurrency(input: {
  tripCurrency?: string | null
  userPreferredCurrency?: string | null
  originAirportCode?: string | null
  originCountry?: string | null
}): TravelCurrencyResolution {
  const tripCurrency = normalizeCurrency(input.tripCurrency)
  if (tripCurrency) return { currency: tripCurrency, source: 'TRIP_SELECTED' }

  const userPreferredCurrency = normalizeCurrency(input.userPreferredCurrency)
  if (userPreferredCurrency) {
    return { currency: userPreferredCurrency, source: 'USER_PREFERRED' }
  }

  const originCurrency = originDefaultCurrency(input)
  if (originCurrency) return { currency: originCurrency, source: 'ORIGIN_DEFAULT' }

  return { currency: APPLICATION_FALLBACK_CURRENCY, source: 'APPLICATION_FALLBACK' }
}
