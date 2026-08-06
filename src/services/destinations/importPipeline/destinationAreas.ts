export type DestinationAreaType = 'city' | 'island' | 'province' | 'region'

export interface DestinationImportArea {
  slug: string
  name: string
  countryCode: string
  countryName: string
  countrySlug: string
  countryIso3?: string
  currencyCode?: string
  phoneCode?: string
  areaType: DestinationAreaType
  aliases: string[]
  osmRelationId?: string
  wikidataId?: string
  boundingBox: {
    south: number
    west: number
    north: number
    east: number
  }
  enabled: boolean
  priority: number
}

const COUNTRIES = {
  BN: { name: 'Brunei', slug: 'brunei', iso3: 'BRN', currencyCode: 'BND', phoneCode: '+673' },
  KH: { name: 'Cambodia', slug: 'cambodia', iso3: 'KHM', currencyCode: 'KHR', phoneCode: '+855' },
  ID: { name: 'Indonesia', slug: 'indonesia', iso3: 'IDN', currencyCode: 'IDR', phoneCode: '+62' },
  LA: { name: 'Laos', slug: 'laos', iso3: 'LAO', currencyCode: 'LAK', phoneCode: '+856' },
  MY: { name: 'Malaysia', slug: 'malaysia', iso3: 'MYS', currencyCode: 'MYR', phoneCode: '+60' },
  MM: { name: 'Myanmar', slug: 'myanmar', iso3: 'MMR', currencyCode: 'MMK', phoneCode: '+95' },
  PH: { name: 'Philippines', slug: 'philippines', iso3: 'PHL', currencyCode: 'PHP', phoneCode: '+63' },
  SG: { name: 'Singapore', slug: 'singapore', iso3: 'SGP', currencyCode: 'SGD', phoneCode: '+65' },
  TH: { name: 'Thailand', slug: 'thailand', iso3: 'THA', currencyCode: 'THB', phoneCode: '+66' },
  TL: { name: 'Timor-Leste', slug: 'timor-leste', iso3: 'TLS', currencyCode: 'USD', phoneCode: '+670' },
  VN: { name: 'Vietnam', slug: 'vietnam', iso3: 'VNM', currencyCode: 'VND', phoneCode: '+84' },
}

type CountryCode = keyof typeof COUNTRIES

function area(input: Omit<DestinationImportArea, 'countryName' | 'countrySlug' | 'countryIso3' | 'currencyCode' | 'phoneCode'>): DestinationImportArea {
  const country = COUNTRIES[input.countryCode as CountryCode]
  return {
    ...input,
    countryName: country.name,
    countrySlug: country.slug,
    countryIso3: country.iso3,
    currencyCode: country.currencyCode,
    phoneCode: country.phoneCode,
  }
}

export const ASEAN_PILOT_AREA_SLUGS = [
  'bangkok',
  'phuket',
  'da-nang',
  'phu-quoc',
  'langkawi',
  'sapa',
  'jakarta',
  'bali',
] as const

export const ASEAN_DESTINATION_AREAS: DestinationImportArea[] = [
  area({ slug: 'bangkok', name: 'Bangkok', countryCode: 'TH', areaType: 'city', aliases: ['Krung Thep Maha Nakhon'], wikidataId: 'Q1861', boundingBox: { south: 13.49, west: 100.32, north: 13.96, east: 100.95 }, enabled: true, priority: 1 }),
  area({ slug: 'phuket', name: 'Phuket', countryCode: 'TH', areaType: 'island', aliases: ['Phuket Island'], wikidataId: 'Q125415', boundingBox: { south: 7.75, west: 98.25, north: 8.25, east: 98.47 }, enabled: true, priority: 2 }),
  area({ slug: 'chiang-mai', name: 'Chiang Mai', countryCode: 'TH', areaType: 'city', aliases: [], wikidataId: 'Q52028', boundingBox: { south: 18.65, west: 98.85, north: 18.95, east: 99.15 }, enabled: true, priority: 20 }),
  area({ slug: 'krabi', name: 'Krabi', countryCode: 'TH', areaType: 'city', aliases: [], wikidataId: 'Q263273', boundingBox: { south: 7.85, west: 98.75, north: 8.25, east: 99.15 }, enabled: true, priority: 20 }),
  area({ slug: 'pattaya', name: 'Pattaya', countryCode: 'TH', areaType: 'city', aliases: [], wikidataId: 'Q170919', boundingBox: { south: 12.85, west: 100.82, north: 13.05, east: 101.05 }, enabled: true, priority: 20 }),
  area({ slug: 'da-nang', name: 'Da Nang', countryCode: 'VN', areaType: 'city', aliases: ['Đà Nẵng'], wikidataId: 'Q25282', boundingBox: { south: 15.95, west: 107.9, north: 16.18, east: 108.35 }, enabled: true, priority: 3 }),
  area({ slug: 'hoi-an', name: 'Hoi An', countryCode: 'VN', areaType: 'city', aliases: ['Hội An'], wikidataId: 'Q170032', boundingBox: { south: 15.82, west: 108.25, north: 15.95, east: 108.45 }, enabled: true, priority: 20 }),
  area({ slug: 'hanoi', name: 'Hanoi', countryCode: 'VN', areaType: 'city', aliases: ['Ha Noi', 'Hà Nội'], wikidataId: 'Q1858', boundingBox: { south: 20.85, west: 105.65, north: 21.25, east: 106.05 }, enabled: true, priority: 20 }),
  area({ slug: 'ho-chi-minh-city', name: 'Ho Chi Minh City', countryCode: 'VN', areaType: 'city', aliases: ['Saigon', 'Sài Gòn'], wikidataId: 'Q1854', boundingBox: { south: 10.35, west: 106.35, north: 11.15, east: 107.05 }, enabled: true, priority: 20 }),
  area({ slug: 'phu-quoc', name: 'Phu Quoc', countryCode: 'VN', areaType: 'island', aliases: ['Phú Quốc'], wikidataId: 'Q342740', boundingBox: { south: 9.9, west: 103.8, north: 10.5, east: 104.1 }, enabled: true, priority: 4 }),
  area({ slug: 'sapa', name: 'Sapa', countryCode: 'VN', areaType: 'region', aliases: ['Sa Pa'], wikidataId: 'Q219926', boundingBox: { south: 22.22, west: 103.75, north: 22.45, east: 104.05 }, enabled: true, priority: 6 }),
  area({ slug: 'langkawi', name: 'Langkawi', countryCode: 'MY', areaType: 'island', aliases: ['Langkawi Island'], wikidataId: 'Q203047', boundingBox: { south: 6.1, west: 99.6, north: 6.55, east: 100.0 }, enabled: true, priority: 5 }),
  area({ slug: 'kuala-lumpur', name: 'Kuala Lumpur', countryCode: 'MY', areaType: 'city', aliases: ['KL'], wikidataId: 'Q1865', boundingBox: { south: 2.95, west: 101.5, north: 3.35, east: 101.85 }, enabled: true, priority: 20 }),
  area({ slug: 'penang', name: 'Penang', countryCode: 'MY', areaType: 'region', aliases: ['Pulau Pinang', 'George Town'], wikidataId: 'Q188096', boundingBox: { south: 5.2, west: 100.15, north: 5.55, east: 100.55 }, enabled: true, priority: 20 }),
  area({ slug: 'melaka', name: 'Melaka', countryCode: 'MY', areaType: 'city', aliases: ['Malacca'], wikidataId: 'Q182208', boundingBox: { south: 2.05, west: 102.05, north: 2.4, east: 102.45 }, enabled: true, priority: 20 }),
  area({ slug: 'kota-kinabalu', name: 'Kota Kinabalu', countryCode: 'MY', areaType: 'city', aliases: [], wikidataId: 'Q182978', boundingBox: { south: 5.85, west: 115.9, north: 6.1, east: 116.25 }, enabled: true, priority: 20 }),
  area({ slug: 'kuching', name: 'Kuching', countryCode: 'MY', areaType: 'city', aliases: [], wikidataId: 'Q2843', boundingBox: { south: 1.45, west: 110.25, north: 1.65, east: 110.45 }, enabled: true, priority: 20 }),
  area({ slug: 'jakarta', name: 'Jakarta', countryCode: 'ID', areaType: 'city', aliases: [], wikidataId: 'Q3630', boundingBox: { south: -6.4, west: 106.65, north: -5.95, east: 107.05 }, enabled: true, priority: 7 }),
  area({ slug: 'bali', name: 'Bali', countryCode: 'ID', areaType: 'island', aliases: [], wikidataId: 'Q4648', boundingBox: { south: -8.9, west: 114.4, north: -8.0, east: 115.75 }, enabled: true, priority: 8 }),
  area({ slug: 'yogyakarta', name: 'Yogyakarta', countryCode: 'ID', areaType: 'city', aliases: ['Jogja'], wikidataId: 'Q3741', boundingBox: { south: -7.9, west: 110.25, north: -7.65, east: 110.55 }, enabled: true, priority: 20 }),
  area({ slug: 'bandung', name: 'Bandung', countryCode: 'ID', areaType: 'city', aliases: [], wikidataId: 'Q10389', boundingBox: { south: -7.05, west: 107.45, north: -6.75, east: 107.8 }, enabled: true, priority: 20 }),
  area({ slug: 'lombok', name: 'Lombok', countryCode: 'ID', areaType: 'island', aliases: [], wikidataId: 'Q216071', boundingBox: { south: -8.95, west: 115.8, north: -8.1, east: 116.75 }, enabled: true, priority: 20 }),
  area({ slug: 'singapore', name: 'Singapore', countryCode: 'SG', areaType: 'city', aliases: [], wikidataId: 'Q334', boundingBox: { south: 1.15, west: 103.55, north: 1.48, east: 104.1 }, enabled: true, priority: 20 }),
  area({ slug: 'siem-reap', name: 'Siem Reap', countryCode: 'KH', areaType: 'city', aliases: [], wikidataId: 'Q11711', boundingBox: { south: 13.25, west: 103.75, north: 13.55, east: 104.05 }, enabled: true, priority: 20 }),
  area({ slug: 'phnom-penh', name: 'Phnom Penh', countryCode: 'KH', areaType: 'city', aliases: [], wikidataId: 'Q1850', boundingBox: { south: 11.4, west: 104.75, north: 11.7, east: 105.05 }, enabled: true, priority: 20 }),
  area({ slug: 'luang-prabang', name: 'Luang Prabang', countryCode: 'LA', areaType: 'city', aliases: ['Louangphabang'], wikidataId: 'Q1860', boundingBox: { south: 19.75, west: 102.05, north: 20.0, east: 102.35 }, enabled: true, priority: 20 }),
  area({ slug: 'vientiane', name: 'Vientiane', countryCode: 'LA', areaType: 'city', aliases: [], wikidataId: 'Q9326', boundingBox: { south: 17.85, west: 102.45, north: 18.05, east: 102.75 }, enabled: true, priority: 20 }),
  area({ slug: 'yangon', name: 'Yangon', countryCode: 'MM', areaType: 'city', aliases: ['Rangoon'], wikidataId: 'Q37995', boundingBox: { south: 16.65, west: 96.0, north: 17.0, east: 96.35 }, enabled: true, priority: 20 }),
  area({ slug: 'bagan', name: 'Bagan', countryCode: 'MM', areaType: 'region', aliases: [], wikidataId: 'Q15305', boundingBox: { south: 21.1, west: 94.75, north: 21.25, east: 95.0 }, enabled: true, priority: 20 }),
  area({ slug: 'bandar-seri-begawan', name: 'Bandar Seri Begawan', countryCode: 'BN', areaType: 'city', aliases: ['BSB'], wikidataId: 'Q9279', boundingBox: { south: 4.8, west: 114.8, north: 5.05, east: 115.05 }, enabled: true, priority: 20 }),
  area({ slug: 'manila', name: 'Manila', countryCode: 'PH', areaType: 'city', aliases: ['Metro Manila'], wikidataId: 'Q1461', boundingBox: { south: 14.35, west: 120.85, north: 14.8, east: 121.15 }, enabled: true, priority: 20 }),
  area({ slug: 'cebu', name: 'Cebu', countryCode: 'PH', areaType: 'city', aliases: ['Cebu City'], wikidataId: 'Q1467', boundingBox: { south: 10.2, west: 123.75, north: 10.45, east: 124.05 }, enabled: true, priority: 20 }),
  area({ slug: 'boracay', name: 'Boracay', countryCode: 'PH', areaType: 'island', aliases: [], wikidataId: 'Q27129', boundingBox: { south: 11.9, west: 121.9, north: 11.99, east: 122.1 }, enabled: true, priority: 20 }),
  area({ slug: 'palawan', name: 'Palawan', countryCode: 'PH', areaType: 'region', aliases: [], wikidataId: 'Q13847', boundingBox: { south: 8.3, west: 117.0, north: 12.5, east: 120.4 }, enabled: true, priority: 20 }),
  area({ slug: 'davao', name: 'Davao', countryCode: 'PH', areaType: 'city', aliases: ['Davao City'], wikidataId: 'Q52517', boundingBox: { south: 6.95, west: 125.35, north: 7.25, east: 125.75 }, enabled: true, priority: 20 }),
  area({ slug: 'dili', name: 'Dili', countryCode: 'TL', areaType: 'city', aliases: [], wikidataId: 'Q9310', boundingBox: { south: -8.7, west: 125.45, north: -8.45, east: 125.75 }, enabled: true, priority: 20 }),
]

export function listDestinationImportAreas(options: { pilotsOnly?: boolean } = {}): DestinationImportArea[] {
  const pilotSet = new Set<string>(ASEAN_PILOT_AREA_SLUGS)
  return ASEAN_DESTINATION_AREAS
    .filter((entry) => entry.enabled)
    .filter((entry) => !options.pilotsOnly || pilotSet.has(entry.slug))
    .sort((first, second) => first.priority - second.priority || first.name.localeCompare(second.name))
    .map((entry) => ({ ...entry, aliases: [...entry.aliases], boundingBox: { ...entry.boundingBox } }))
}

export function resolveDestinationImportArea(slugOrAlias: string): DestinationImportArea | null {
  const normalized = slugOrAlias.trim().toLowerCase()
  const area = ASEAN_DESTINATION_AREAS.find(
    (entry) =>
      entry.slug === normalized ||
      entry.name.toLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  )
  return area ? { ...area, aliases: [...area.aliases], boundingBox: { ...area.boundingBox } } : null
}
