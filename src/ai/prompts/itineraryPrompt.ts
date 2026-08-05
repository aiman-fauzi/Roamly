import type { GenerateItineraryRequest } from '@/ai/types'
import { FOOD_OPTIONS, TRAVEL_STYLE_OPTIONS } from '@/constants/questionnaire'

const TRAVEL_STYLE_LABELS = new Map(
  TRAVEL_STYLE_OPTIONS.map((option) => [option.value, option.label])
)
const FOOD_LABELS = new Map(FOOD_OPTIONS.map((option) => [option.value, option.label]))

function formatSelections(values: string[], labels: Map<string, string>): string {
  return values.map((value) => labels.get(value) ?? value).join(', ')
}

function formatDestinationContext(request: GenerateItineraryRequest): string[] {
  if (!request.destinationContext) return []

  return [
    '',
    '## Supplied Destination Candidates',
    'Use only these destination candidates for place-based itinerary items.',
    'Every morning, afternoon, and evening item must reference one supplied candidateId.',
    'Do not invent attractions, restaurants, hotels, activities, addresses, coordinates, prices, or opening hours.',
    'If a candidate has PRICE_UNKNOWN, use 0 for item cost and set priceConfidence to PRICE_UNKNOWN.',
    'Do not invent missing opening hours or ticket prices; mark unknown information for user verification.',
    'Prefer VERIFIED facts over STALE facts. Stale facts may be useful, but must be labelled for verification.',
    'If openingHoursStatus is UNKNOWN, do not state that the place is open at a specific time unless you clearly label the timing as an assumption.',
    'If openingHoursKnown is false, do not state that the place is open at a specific time.',
    'If staleFactCount is greater than 0, include a concise tip or note telling the traveler to verify current facts before visiting.',
    JSON.stringify(request.destinationContext, null, 2),
  ]
}

function formatTravelOfferContext(request: GenerateItineraryRequest): string[] {
  if (!request.travelOffersContext) return []

  return [
    '',
    '## Supplied Travel Offers',
    'Use only these supplied travel offers when referencing flights or hotels.',
    'Do not invent flight offers, hotel offers, carrier details, hotel names, prices, booking URLs, baggage, or refund rules.',
    'If selectedFlightOfferId or selectedHotelOfferId is present, it must exactly match a supplied offerId.',
    'Do not choose a different offer than the supplied selected offer IDs.',
    JSON.stringify(request.travelOffersContext, null, 2),
  ]
}

function formatBudgetSummary(request: GenerateItineraryRequest): string[] {
  if (!request.budgetSummary) return []

  return [
    '',
    '## Deterministic Budget Summary',
    'Use this budget summary as the source of truth for whole-trip flight, hotel, allowance, contingency, and missing-cost context.',
    'Do not replace known offer totals with invented prices.',
    'Mention unknown or partial categories in notes or tips where useful.',
    JSON.stringify(request.budgetSummary, null, 2),
  ]
}

export function buildItineraryPrompt(request: GenerateItineraryRequest): string {
  const lines: string[] = [
    `You are an expert travel planner. Generate a detailed ${request.durationDays}-day itinerary for the following trip.`,
    '',
    '## Trip Details',
    `- Destination: ${request.destination}`,
    `- Duration: ${request.durationDays} day${request.durationDays !== 1 ? 's' : ''}`,
    `- Group size: ${request.groupSize} person${request.groupSize !== 1 ? 's' : ''}`,
    `- Budget: ${request.budget} ${request.userCurrency} total`,
    `- User currency: ${request.userCurrency}`,
    `- Destination/local currency: ${request.destinationCurrency}`,
    `- Exchange rate: 1 ${request.destinationCurrency} = ${request.exchangeRate} ${request.userCurrency}`,
    `- Exchange-rate source: ${request.exchangeRateSource}`,
    `- Exchange-rate fetched at: ${request.exchangeRateFetchedAt}`,
    `- Exchange-rate came from cache: ${request.exchangeRateFromCache ? 'yes' : 'no'}`,
  ]

  if (request.travelStyles.length > 0) {
    lines.push('Trip Style:', formatSelections(request.travelStyles, TRAVEL_STYLE_LABELS))
  }
  if (request.accommodationType) {
    lines.push(`- Accommodation preference: ${request.accommodationType}`)
  }
  if (request.transportationPreference) {
    lines.push(`- Transportation preference: ${request.transportationPreference}`)
  }
  if (request.foodPreferences.length > 0) {
    lines.push('Food Preferences:', formatSelections(request.foodPreferences, FOOD_LABELS))
  }
  if (request.activityPreferences.length > 0) {
    lines.push(`- Activity interests: ${request.activityPreferences.join(', ')}`)
  }
  if (request.travelInterests.length > 0) {
    lines.push(`- User travel interests: ${request.travelInterests.join(', ')}`)
  }
  if (request.preferredLanguage) {
    lines.push(`- Preferred language: ${request.preferredLanguage}`)
  }

  lines.push(...formatTravelOfferContext(request))
  lines.push(...formatBudgetSummary(request))
  lines.push(...formatDestinationContext(request))

  lines.push(
    '',
    '## Cost and Currency Rules',
    `Use ONLY the provided exchange rate for conversion. Do not invent or update exchange rates.`,
    `Every item must include estimatedCostLocal in ${request.destinationCurrency}, estimatedCostUserCurrency in ${request.userCurrency}, and priceConfidence.`,
    'Use KNOWN_PRICE only when a supplied candidate includes an exact sourced price. Use ESTIMATED_PRICE only when structured source data supports an estimate. Otherwise use PRICE_UNKNOWN.',
    'Daily totals must equal the sum of all morning, afternoon, and evening item costs for that day.',
    'Grand total must equal the sum of daily totals. Show whether the budget is exceeded.',
    '',
    '## Output Format',
    'Return ONLY a valid JSON object. Do not include markdown, explanations, or code fences.',
    'The JSON must conform exactly to this schema:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "selectedFlightOfferId": "optional supplied flight offerId",',
    '  "selectedHotelOfferId": "optional supplied hotel offerId",',
    `  "currencyLocal": "${request.destinationCurrency}",`,
    `  "currencyUser": "${request.userCurrency}",`,
    '  "exchangeRate": {',
    '    "baseCurrency": "string",',
    '    "quoteCurrency": "string",',
    '    "rate": 0,',
    '    "source": "string",',
    '    "fetchedAt": "ISO timestamp string",',
    '    "fromCache": false',
    '  },',
    '  "budget": {',
    '    "totalBudgetUserCurrency": 0,',
    '    "estimatedTotalLocal": 0,',
    '    "estimatedTotalUserCurrency": 0,',
    '    "remainingBudgetUserCurrency": 0,',
    '    "isBudgetExceeded": false',
    '  },',
    '  "days": [',
    '    {',
    '      "dayNumber": 1,',
    '      "theme": "string",',
    '      "morning": [',
    '        {',
    '          "time": "08:30",',
    '          "candidateId": "ATTRACTION:stable-id-from-candidates",',
    '          "title": "string",',
    '          "description": "string",',
    '          "location": "string",',
    '          "latitude": 0,',
    '          "longitude": 0,',
    '          "transport": "string",',
    '          "estimatedDuration": "string",',
    '          "durationMinutes": 120,',
    '          "reason": "string explaining why this candidate fits the trip",',
    '          "estimatedCostLocal": 0,',
    '          "estimatedCostUserCurrency": 0,',
    '          "currencyLocal": "string",',
    '          "currencyUser": "string",',
    '          "priceConfidence": "KNOWN_PRICE | ESTIMATED_PRICE | PRICE_UNKNOWN",',
    '          "tips": ["string"]',
    '        }',
    '      ],',
    '      "afternoon": [],',
    '      "evening": [],',
    '      "dailyTotalLocal": 0,',
    '      "dailyTotalUserCurrency": 0,',
    '      "notes": ["string"]',
    '    }',
    '  ],',
    '  "roadmap": [',
    '    {',
    '      "dayNumber": 1,',
    '      "items": [{ "label": "Central Market", "kind": "attraction", "time": "09:00" }]',
    '    }',
    '  ]',
    '}',
    '',
    `Produce exactly ${request.durationDays} day objects. Each day must include morning, afternoon, and evening arrays.`,
    'Each day should include transportation, estimated duration, estimated cost, and notes.',
    'Roadmap item kind must be one of: attraction, restaurant, hotel, food, transport, activity, shopping, nightlife, start, end, other.',
    'Roadmap items must be structured data for a vertical travel timeline.',
    'Grand Total and budget comparison must be represented in the budget object.'
  )

  return lines.join('\n')
}
