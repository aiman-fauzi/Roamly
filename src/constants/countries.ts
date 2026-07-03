export interface CountryOption {
  label: string
  value: string
  currency: string
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { label: 'Malaysia', value: 'Malaysia', currency: 'MYR' },
  { label: 'Japan', value: 'Japan', currency: 'JPY' },
  { label: 'United States', value: 'United States', currency: 'USD' },
  { label: 'United Kingdom', value: 'United Kingdom', currency: 'GBP' },
  { label: 'Australia', value: 'Australia', currency: 'AUD' },
]

export const TRAVEL_INTEREST_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'culture', label: 'Culture' },
  { value: 'nature', label: 'Nature' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'history', label: 'History' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'family', label: 'Family-friendly' },
  { value: 'hidden-gems', label: 'Hidden gems' },
] as const

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Malay' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'es', label: 'Spanish' },
] as const

export function getSuggestedCurrency(country: string): string | null {
  const normalized = country.trim().toLowerCase()
  const option = COUNTRY_OPTIONS.find((item) => item.value.toLowerCase() === normalized)
  return option?.currency ?? null
}
