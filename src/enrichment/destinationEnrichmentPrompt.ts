import type { EnrichableDestination } from '@/enrichment/types'

function formatList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : 'None provided'
}

export function buildDestinationEnrichmentPrompt(destination: EnrichableDestination): string {
  return [
    'You enrich imported travel destination records for Roamly.',
    'Use only the supplied destination facts. If a detail is uncertain, make a conservative travel-planning estimate.',
    'Return concise, production-ready metadata for search and filtering.',
    '',
    'Destination facts:',
    `Name: ${destination.name}`,
    `Type: ${destination.kind}`,
    `City: ${destination.cityName}`,
    `Country: ${destination.countryName}`,
    `Description: ${destination.description ?? 'None provided'}`,
    `Address: ${destination.address ?? 'None provided'}`,
    `Category: ${destination.category ?? 'None provided'}`,
    `Cuisines: ${formatList(destination.cuisines)}`,
    `Amenities: ${formatList(destination.amenities)}`,
    `Existing tags: ${formatList(destination.tags)}`,
    `Price level: ${destination.priceLevel ?? 'Unknown'}`,
    `Imported duration minutes: ${destination.durationMinutes ?? 'Unknown'}`,
    `Coordinates: ${destination.latitude ?? 'Unknown'}, ${destination.longitude ?? 'Unknown'}`,
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "shortSummary": "one sentence under 320 characters",',
    '  "bestFor": ["2 to 6 short audience/use-case labels"],',
    '  "hiddenGemScore": 0-100,',
    '  "photographyScore": 0-100,',
    '  "familyFriendly": true/false,',
    '  "coupleFriendly": true/false,',
    '  "kidsFriendly": true/false,',
    '  "budgetLevel": "FREE" | "BUDGET" | "MODERATE" | "PREMIUM" | "LUXURY",',
    '  "estimatedVisitDurationMinutes": positive integer,',
    '  "bestVisitingHours": ["1 to 4 simple time windows like Morning or 17:00-19:00"],',
    '  "indoorOutdoor": "INDOOR" | "OUTDOOR" | "MIXED",',
    '  "rainFriendly": true/false,',
    '  "searchTags": ["6 to 16 lowercase search tags"]',
    '}',
  ].join('\n')
}
