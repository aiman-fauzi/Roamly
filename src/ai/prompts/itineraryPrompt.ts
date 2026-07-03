import type { GenerateItineraryRequest } from '@/ai/types'
import { FOOD_OPTIONS, TRAVEL_STYLE_OPTIONS } from '@/constants/questionnaire'

const TRAVEL_STYLE_LABELS = new Map(
  TRAVEL_STYLE_OPTIONS.map((option) => [option.value, option.label])
)
const FOOD_LABELS = new Map(FOOD_OPTIONS.map((option) => [option.value, option.label]))

function formatSelections(values: string[], labels: Map<string, string>): string {
  return values.map((value) => labels.get(value) ?? value).join(', ')
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

  lines.push(
    '',
    '## Cost and Currency Rules',
    `Use ONLY the provided exchange rate for conversion. Do not invent or update exchange rates.`,
    `Every item must include estimatedCostLocal in ${request.destinationCurrency} and estimatedCostUserCurrency in ${request.userCurrency}.`,
    'Daily totals must equal the sum of all morning, afternoon, and evening item costs for that day.',
    'Grand total must equal the sum of daily totals. Show whether the budget is exceeded.',
    '',
    '## Output Format',
    'Return ONLY a valid JSON object. Do not include markdown, explanations, or code fences.',
    'The JSON must conform exactly to this schema:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
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
    '          "title": "string",',
    '          "description": "string",',
    '          "location": "string",',
    '          "latitude": 0,',
    '          "longitude": 0,',
    '          "transport": "string",',
    '          "estimatedDuration": "string",',
    '          "estimatedCostLocal": 0,',
    '          "estimatedCostUserCurrency": 0,',
    '          "currencyLocal": "string",',
    '          "currencyUser": "string",',
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
    '      "items": [{ "label": "Hotel", "kind": "hotel", "time": "08:00" }]',
    '    }',
    '  ]',
    '}',
    '',
    `Produce exactly ${request.durationDays} day objects. Each day must include morning, afternoon, and evening arrays.`,
    'Each day should include transportation, estimated duration, estimated cost, and notes.',
    'Roadmap items must be structured data for a vertical travel timeline.',
    'Grand Total and budget comparison must be represented in the budget object.'
  )

  return lines.join('\n')
}