export type RetrievalCategory =
  | 'culture'
  | 'history'
  | 'religious'
  | 'museum'
  | 'market'
  | 'night_market'
  | 'family'
  | 'nature'
  | 'beach'
  | 'island'
  | 'national_park'
  | 'waterfall'
  | 'viewpoint'
  | 'cable_car'
  | 'safari'
  | 'theme_park'
  | 'entertainment'
  | 'landmark'
  | 'food'
  | 'shopping'
  | 'fishing_village'
  | 'local_experience'

export type DestinationDisplayNameSource =
  | 'verifiedEnglishName'
  | 'osmEnglishName'
  | 'primaryName'
  | 'localName'

export interface DestinationDisplayNameSelection {
  displayName: string
  displayNameSource: DestinationDisplayNameSource
  englishName: string | null
  localName: string | null
  primaryName: string
}

const CATEGORY_MAP: Record<string, RetrievalCategory[]> = {
  museum: ['museum', 'culture', 'history'],
  gallery: ['culture', 'museum'],
  artwork: ['culture', 'landmark'],
  historic: ['history', 'culture', 'landmark'],
  heritage: ['history', 'culture', 'landmark'],
  place_of_worship: ['religious', 'culture', 'history'],
  place_of_worships: ['religious', 'culture', 'history'],
  market: ['market', 'food', 'shopping', 'culture'],
  marketplace: ['market', 'food', 'shopping', 'culture'],
  night_market: ['night_market', 'market', 'food', 'shopping', 'culture', 'entertainment'],
  landmark: ['landmark', 'culture'],
  aquarium: ['family', 'entertainment'],
  zoo: ['family', 'nature', 'entertainment'],
  safari: ['safari', 'family', 'nature', 'entertainment'],
  theme_park: ['theme_park', 'entertainment', 'family'],
  cultural_venue: ['culture', 'entertainment'],
  arts_centre: ['culture', 'entertainment'],
  theatre: ['culture', 'entertainment'],
  viewpoint: ['viewpoint', 'nature'],
  beach: ['beach', 'nature'],
  peak: ['nature', 'viewpoint'],
  waterfall: ['waterfall', 'nature', 'viewpoint'],
  park: ['nature'],
  nature_reserve: ['nature'],
  national_park: ['national_park', 'nature'],
  natural_attraction: ['nature'],
  island: ['island', 'nature', 'beach'],
  forest: ['nature'],
  cave: ['nature'],
  cable_car: ['cable_car', 'island', 'family', 'entertainment', 'viewpoint'],
  fishing_village: ['fishing_village', 'local_experience', 'culture', 'food'],
  local_experience: ['local_experience', 'culture', 'food'],
}

const PRIMARY_CATEGORY_ORDER: RetrievalCategory[] = [
  'religious',
  'museum',
  'night_market',
  'market',
  'beach',
  'island',
  'national_park',
  'waterfall',
  'viewpoint',
  'cable_car',
  'safari',
  'theme_park',
  'family',
  'entertainment',
  'fishing_village',
  'local_experience',
  'history',
  'landmark',
  'nature',
  'food',
  'shopping',
  'culture',
]

function normalizeTaxonomyToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
}

export function retrievalCategoriesForDestination(input: {
  sourceCategories?: string[]
  tags?: string[]
}): RetrievalCategory[] {
  const categories: RetrievalCategory[] = []
  const values = [...(input.sourceCategories ?? []), ...(input.tags ?? [])]
  for (const value of values) {
    const mapped = CATEGORY_MAP[normalizeTaxonomyToken(value)]
    if (!mapped) continue
    for (const category of mapped) {
      if (!categories.includes(category)) categories.push(category)
    }
  }
  return categories
}

export function primaryRetrievalCategory(input: {
  categories?: string[]
  tags?: string[]
}): string {
  const categories = (input.categories ?? []).filter(Boolean)
  for (const category of PRIMARY_CATEGORY_ORDER) {
    if (categories.includes(category)) return category
  }
  return categories[0] ?? input.tags?.[0] ?? 'uncategorized'
}

function cleanDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed || null
}

export function selectDestinationDisplayName(input: {
  primaryName: string
  localName?: string | null
  verifiedEnglishName?: string | null
  osmEnglishName?: string | null
}): DestinationDisplayNameSelection {
  const primaryName = cleanDisplayName(input.primaryName) ?? 'Unnamed destination'
  const localName = cleanDisplayName(input.localName)
  const verifiedEnglishName = cleanDisplayName(input.verifiedEnglishName)
  const osmEnglishName = cleanDisplayName(input.osmEnglishName)
  const englishName = verifiedEnglishName ?? osmEnglishName

  if (verifiedEnglishName) {
    return {
      displayName: verifiedEnglishName,
      displayNameSource: 'verifiedEnglishName',
      englishName,
      localName,
      primaryName,
    }
  }
  if (osmEnglishName) {
    return {
      displayName: osmEnglishName,
      displayNameSource: 'osmEnglishName',
      englishName,
      localName,
      primaryName,
    }
  }

  return {
    displayName: primaryName,
    displayNameSource: input.primaryName.trim() ? 'primaryName' : 'localName',
    englishName,
    localName,
    primaryName,
  }
}
