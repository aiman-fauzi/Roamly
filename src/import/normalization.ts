const SLUG_SEPARATOR = '-'

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
    .replace(/^-+|-+$/g, '')
    .slice(0, 220)
}

export function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

export function normalizeStringList(values: Array<string | undefined> | undefined): string[] {
  if (!values) return []
  const normalized = values
    .flatMap((value) => value?.split(/[;,|]/) ?? [])
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value))

  return [...new Set(normalized)]
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

export function haversineDistanceMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number
): number {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLatitude = toRadians(secondLatitude - firstLatitude)
  const deltaLongitude = toRadians(secondLongitude - firstLongitude)
  const firstLatRad = toRadians(firstLatitude)
  const secondLatRad = toRadians(secondLatitude)

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(firstLatRad) * Math.cos(secondLatRad) * Math.sin(deltaLongitude / 2) ** 2

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
