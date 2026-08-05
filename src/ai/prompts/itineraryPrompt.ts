import type { GenerateItineraryRequest } from '@/ai/types'
import { FOOD_OPTIONS, TRAVEL_STYLE_OPTIONS } from '@/constants/questionnaire'
import { compactDestinationContextForPrompt } from '@/services/destinations/geminiContext'

const TRAVEL_STYLE_LABELS = new Map(
  TRAVEL_STYLE_OPTIONS.map((option) => [option.value, option.label])
)
const FOOD_LABELS = new Map(FOOD_OPTIONS.map((option) => [option.value, option.label]))

function formatSelections(values: string[], labels: Map<string, string>): string {
  return values.map((value) => labels.get(value) ?? value).join(', ')
}

function formatDestinationContext(request: GenerateItineraryRequest): string[] {
  if (!request.destinationContext) return []

  const compactContext = compactDestinationContextForPrompt(request.destinationContext)

  return [
    '',
    '## Supplied Destination Candidates',
    'Use only these destination candidates for place-based itinerary items.',
    'Every item must reference one supplied candidateId.',
    'Do not invent attractions, restaurants, hotels, activities, addresses, coordinates, prices, or opening hours.',
    'If priceStatus is UNKNOWN, do not invent a price.',
    JSON.stringify(compactContext),
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
    'Backend budget calculation is the source of truth. Use this only for high-level awareness; do not output budget fields.',
    JSON.stringify({
      currency: request.budgetSummary.currency,
      total: request.budgetSummary.total.amount,
      missingData: request.budgetSummary.missingData.slice(0, 6),
    }),
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
    '## Output Format',
    'Return ONLY a valid JSON object. Do not include markdown, explanations, or code fences.',
    'The JSON must conform exactly to this compact schema:',
    '{"items":[{"candidateId":"supplied candidateId","day":1,"startTime":"09:00","durationMinutes":90,"reason":"short reason"}]}',
    '',
    `Use day values from 1 to ${request.durationDays}.`,
    'Use startTime as HH:mm in local destination time.',
    'Keep reason under 120 characters.',
    'Do not output titles, descriptions, coordinates, prices, budget, exchange rates, roadmap, notes, or transport.',
    'The backend will enrich valid candidate IDs from Supabase metadata.'
  )

  return lines.join('\n')
}
