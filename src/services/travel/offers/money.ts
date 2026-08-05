import type { ExchangeRateResult } from '@/services/exchangeRateService'
import type { ConvertedMoney, Money } from '@/services/travel/offers/types'

const ZERO = BigInt(0)
const ONE = BigInt(1)
const NEGATIVE_ONE = BigInt(-1)
const TWO = BigInt(2)
const MINOR_UNITS = BigInt(100)
const RATE_SCALE = BigInt(100_000_000)

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error(`Invalid currency code: ${currency}`)
  return normalized
}

export function normalizeMoney(value: Money): Money {
  return {
    amount: formatMinorUnits(parseMoneyMinorUnits(value)),
    currency: normalizeCurrency(value.currency),
  }
}

export function parseMoneyMinorUnits(value: Money): bigint {
  const currency = normalizeCurrency(value.currency)
  const normalized = value.amount.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid money amount for ${currency}: ${value.amount}`)
  }

  const [whole, fraction = ''] = normalized.split('.')
  const sign = whole.startsWith('-') ? NEGATIVE_ONE : ONE
  const absoluteWhole = whole.replace('-', '')
  return sign * (BigInt(absoluteWhole) * MINOR_UNITS + BigInt(fraction.padEnd(2, '0')))
}

export function formatMinorUnits(minorUnits: bigint): string {
  const sign = minorUnits < ZERO ? '-' : ''
  const absolute = minorUnits < ZERO ? -minorUnits : minorUnits
  const whole = absolute / MINOR_UNITS
  const fraction = (absolute % MINOR_UNITS).toString().padStart(2, '0')
  return `${sign}${whole}.${fraction}`
}

export function money(amount: string | number, currency: string): Money {
  return normalizeMoney({ amount: String(amount), currency })
}

export function addMoney(values: Money[], currency: string): Money {
  const normalizedCurrency = normalizeCurrency(currency)
  const total = values.reduce((sum, value) => {
    if (normalizeCurrency(value.currency) !== normalizedCurrency) {
      throw new Error(`Cannot add ${value.currency} to ${normalizedCurrency}.`)
    }
    return sum + parseMoneyMinorUnits(value)
  }, ZERO)

  return { amount: formatMinorUnits(total), currency: normalizedCurrency }
}

export function subtractMoney(first: Money, second: Money): Money {
  const firstCurrency = normalizeCurrency(first.currency)
  const secondCurrency = normalizeCurrency(second.currency)
  if (firstCurrency !== secondCurrency) throw new Error(`Cannot subtract ${secondCurrency} from ${firstCurrency}.`)

  return {
    amount: formatMinorUnits(parseMoneyMinorUnits(first) - parseMoneyMinorUnits(second)),
    currency: firstCurrency,
  }
}

export function multiplyMoney(value: Money, multiplier: number): Money {
  if (!Number.isInteger(multiplier) || multiplier < 0) {
    throw new Error('Money multiplier must be a non-negative integer.')
  }

  return {
    amount: formatMinorUnits(parseMoneyMinorUnits(value) * BigInt(multiplier)),
    currency: normalizeCurrency(value.currency),
  }
}

export function divideMoney(value: Money, divisor: number): Money {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new Error('Money divisor must be a positive integer.')
  }

  const minorUnits = parseMoneyMinorUnits(value)
  const sign = minorUnits < ZERO ? NEGATIVE_ONE : ONE
  const absolute = minorUnits < ZERO ? -minorUnits : minorUnits
  const rounded = sign * ((absolute + BigInt(Math.floor(divisor / 2))) / BigInt(divisor))
  return {
    amount: formatMinorUnits(rounded),
    currency: normalizeCurrency(value.currency),
  }
}

export function percentMoney(value: Money, percent: number): Money {
  if (!Number.isFinite(percent) || percent < 0) throw new Error('Percent must be non-negative.')
  const scaledPercent = BigInt(percent.toFixed(4).replace('.', ''))
  const scale = BigInt(1_000_000)
  const numerator = parseMoneyMinorUnits(value) * scaledPercent
  const rounded = (numerator + scale / TWO) / scale
  return {
    amount: formatMinorUnits(rounded),
    currency: normalizeCurrency(value.currency),
  }
}

function rateToScaledInteger(rate: number): bigint {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Exchange rate must be positive.')
  return BigInt(rate.toFixed(8).replace('.', ''))
}

export function convertMoney(value: Money, exchangeRate: ExchangeRateResult): ConvertedMoney {
  const original = normalizeMoney(value)
  const baseCurrency = normalizeCurrency(exchangeRate.baseCurrency)
  const quoteCurrency = normalizeCurrency(exchangeRate.quoteCurrency)
  if (normalizeCurrency(original.currency) !== baseCurrency) {
    throw new Error(`Exchange rate ${baseCurrency}/${quoteCurrency} cannot convert ${original.currency}.`)
  }

  const numerator = parseMoneyMinorUnits(original) * rateToScaledInteger(exchangeRate.rate)
  const rounded = (numerator + RATE_SCALE / TWO) / RATE_SCALE
  return {
    original,
    converted: {
      amount: formatMinorUnits(rounded),
      currency: quoteCurrency,
    },
    exchangeRate,
  }
}

export function compareMoney(first: Money, second: Money): number {
  const firstCurrency = normalizeCurrency(first.currency)
  const secondCurrency = normalizeCurrency(second.currency)
  if (firstCurrency !== secondCurrency) throw new Error(`Cannot compare ${firstCurrency} and ${secondCurrency}.`)
  const delta = parseMoneyMinorUnits(first) - parseMoneyMinorUnits(second)
  return delta < ZERO ? -1 : delta > ZERO ? 1 : 0
}
