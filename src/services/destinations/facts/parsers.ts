import type {
  StructuredOpeningHours,
  StructuredOpeningHoursParseResult,
  StructuredPrice,
  StructuredPriceAudience,
  StructuredPriceParseResult,
  Weekday,
} from '@/services/destinations/facts/types'

const DAY_ALIASES: Record<string, Weekday> = {
  mo: 'MONDAY',
  mon: 'MONDAY',
  monday: 'MONDAY',
  tu: 'TUESDAY',
  tue: 'TUESDAY',
  tuesday: 'TUESDAY',
  we: 'WEDNESDAY',
  wed: 'WEDNESDAY',
  wednesday: 'WEDNESDAY',
  th: 'THURSDAY',
  thu: 'THURSDAY',
  thursday: 'THURSDAY',
  fr: 'FRIDAY',
  fri: 'FRIDAY',
  friday: 'FRIDAY',
  sa: 'SATURDAY',
  sat: 'SATURDAY',
  saturday: 'SATURDAY',
  su: 'SUNDAY',
  sun: 'SUNDAY',
  sunday: 'SUNDAY',
}

const WEEKDAYS: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

function normalizeDay(value: string): Weekday | null {
  return DAY_ALIASES[value.trim().toLowerCase()] ?? null
}

function expandDayRange(start: Weekday, end: Weekday): Weekday[] {
  const startIndex = WEEKDAYS.indexOf(start)
  const endIndex = WEEKDAYS.indexOf(end)
  if (startIndex < 0 || endIndex < 0) return []
  if (startIndex <= endIndex) return WEEKDAYS.slice(startIndex, endIndex + 1)
  return [...WEEKDAYS.slice(startIndex), ...WEEKDAYS.slice(0, endIndex + 1)]
}

function readDays(value: string): Weekday[] {
  return value.split(',').flatMap((part) => {
    const [start, end] = part.split('-').map((day) => normalizeDay(day))
    if (!start) return []
    return end ? expandDayRange(start, end) : [start]
  })
}

const AMBIGUOUS_HOURS_TERMS = [
  'varies',
  'seasonal',
  'seasonally',
  'call ahead',
  'by appointment',
  'prayer time',
  'public holiday',
  'public holidays',
]

function emptyWeeklyInterval(): StructuredOpeningHours['weekly'] {
  return WEEKDAYS.map((day) => ({
    day,
    intervals: [{ opens: '00:00', closes: '23:59' }],
  }))
}

export function parseOpeningHoursFact(
  rawValue: string,
  options: { timezone?: string; sourceUrl?: string; verifiedAt?: string } = {}
): StructuredOpeningHoursParseResult {
  const trimmedRaw = rawValue.trim()
  const normalizedRaw = trimmedRaw.toLowerCase()

  if (!trimmedRaw) {
    return { status: 'UNSUPPORTED', rawValue, reason: 'Opening-hours value is empty.' }
  }

  if (normalizedRaw === '24/7' || normalizedRaw === 'open 24 hours') {
    return {
      status: 'PARSED',
      rawValue,
      value: {
        timezone: options.timezone,
        weekly: emptyWeeklyInterval(),
        notes: 'Open 24 hours.',
        sourceUrl: options.sourceUrl,
        verifiedAt: options.verifiedAt,
      },
    }
  }

  if (AMBIGUOUS_HOURS_TERMS.some((term) => normalizedRaw.includes(term))) {
    return {
      status: 'AMBIGUOUS',
      rawValue,
      reason: 'Opening-hours text contains ambiguous or seasonal terms.',
    }
  }

  const weekly = new Map<Weekday, StructuredOpeningHours['weekly'][number]>()
  const notes: string[] = []
  const segments = trimmedRaw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const holidayNote = segment.match(/^(PH|Public Holidays?)\s+(.+)$/i)
    if (holidayNote) {
      notes.push(segment)
      continue
    }

    const match = segment.match(/^([A-Za-z,\-\s]+)\s+(.+)$/)
    if (!match) {
      notes.push(segment)
      continue
    }
    const days = readDays(match[1])
    const value = match[2].trim().toLowerCase()
    const closed = value === 'off' || value === 'closed'
    const intervals = value
      .split(',')
      .map((interval) => interval.trim())
      .map((interval) => interval.match(/^([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/))
      .filter((interval): interval is RegExpMatchArray => Boolean(interval))
      .map((interval) => ({ opens: interval[1], closes: interval[2] }))

    for (const day of days) {
      weekly.set(day, {
        day,
        intervals,
        closed,
      })
    }
  }

  if (weekly.size === 0) {
    return {
      status: 'UNSUPPORTED',
      rawValue,
      reason: 'No supported weekly day schedule could be parsed.',
    }
  }

  const missingDays = WEEKDAYS.length - weekly.size
  return {
    status: missingDays > 0 || notes.length > 0 ? 'PARTIAL' : 'PARSED',
    rawValue,
    value: {
      timezone: options.timezone,
      weekly: WEEKDAYS.filter((day) => weekly.has(day)).map((day) => weekly.get(day)!),
      notes: notes.join('; ') || undefined,
      sourceUrl: options.sourceUrl,
      verifiedAt: options.verifiedAt,
    },
    reason: missingDays > 0 ? `${missingDays} weekday${missingDays === 1 ? '' : 's'} missing.` : undefined,
  }
}

export function parseStructuredOpeningHours(
  rawValue: string,
  options: { timezone?: string; sourceUrl?: string; verifiedAt?: string } = {}
): StructuredOpeningHours | null {
  return parseOpeningHoursFact(rawValue, options).value ?? null
}

function readAudience(rawValue: string): StructuredPriceAudience {
  const normalized = rawValue.toLowerCase()
  if (normalized.includes('child') || normalized.includes('children')) return 'CHILD'
  if (normalized.includes('senior')) return 'SENIOR'
  if (normalized.includes('student')) return 'STUDENT'
  if (normalized.includes('adult')) return 'ADULT'
  return 'GENERAL'
}

export function parseStructuredPrice(
  rawValue: string,
  options: { currency?: string; sourceUrl?: string; verifiedAt?: string } = {}
): StructuredPrice | null {
  const normalized = rawValue.trim().toLowerCase()
  const currency = options.currency ?? (normalized.includes('rm') ? 'MYR' : 'MYR')

  if (!normalized || normalized === 'unknown') {
    return {
      currency,
      priceType: 'UNKNOWN',
      sourceUrl: options.sourceUrl,
      verifiedAt: options.verifiedAt,
    }
  }
  if (normalized.includes('free')) {
    return {
      amount: 0,
      currency,
      priceType: 'FREE',
      audience: 'GENERAL',
      sourceUrl: options.sourceUrl,
      verifiedAt: options.verifiedAt,
    }
  }

  const range = normalized.match(/(?:rm|myr)?\s*(\d+(?:\.\d+)?)\s*-\s*(?:rm|myr)?\s*(\d+(?:\.\d+)?)/)
  if (range) {
    return {
      minAmount: Number(range[1]),
      maxAmount: Number(range[2]),
      currency,
      priceType: 'RANGE',
      audience: 'GENERAL',
      sourceUrl: options.sourceUrl,
      verifiedAt: options.verifiedAt,
    }
  }

  const from = normalized.match(/from\s+(?:rm|myr)?\s*(\d+(?:\.\d+)?)/)
  if (from) {
    return {
      minAmount: Number(from[1]),
      currency,
      priceType: 'FROM',
      audience: 'GENERAL',
      sourceUrl: options.sourceUrl,
      verifiedAt: options.verifiedAt,
    }
  }

  const fixed = normalized.match(/(?:rm|myr)?\s*(\d+(?:\.\d+)?)/)
  if (!fixed) return null

  return {
    amount: Number(fixed[1]),
    currency,
    priceType: 'FIXED',
    audience: 'GENERAL',
    sourceUrl: options.sourceUrl,
    verifiedAt: options.verifiedAt,
  }
}

export function parseStructuredPrices(
  rawValue: string,
  options: { currency?: string; sourceUrl?: string; verifiedAt?: string } = {}
): StructuredPriceParseResult {
  const trimmedRaw = rawValue.trim()
  const normalized = trimmedRaw.toLowerCase()
  if (!trimmedRaw) {
    return { status: 'UNSUPPORTED', rawValue, values: [], reason: 'Price value is empty.' }
  }

  if (
    normalized.includes('temporarily unavailable') ||
    normalized.includes('not available') ||
    normalized.includes('suspended')
  ) {
    return {
      status: 'PARTIAL',
      rawValue,
      values: [
        {
          currency: options.currency ?? 'MYR',
          priceType: 'UNKNOWN',
          sourceUrl: options.sourceUrl,
          verifiedAt: options.verifiedAt,
        },
      ],
      reason: 'Price is temporarily unavailable.',
    }
  }

  const segments = trimmedRaw
    .split(/;|\n/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  const values = segments.flatMap((segment) => {
    const price = parseStructuredPrice(segment, options)
    if (!price) return []
    return [{ ...price, audience: readAudience(segment) }]
  })

  if (values.length === 0) {
    return {
      status: normalized.includes('varies') ? 'AMBIGUOUS' : 'UNSUPPORTED',
      rawValue,
      values: [],
      reason: normalized.includes('varies')
        ? 'Price text is ambiguous.'
        : 'No supported price amount could be parsed.',
    }
  }

  return {
    status: values.length < segments.length ? 'PARTIAL' : 'PARSED',
    rawValue,
    values,
    reason: values.length < segments.length ? 'Some price segments could not be parsed.' : undefined,
  }
}
