import { resolveDestinationCity } from '@/services/destinations/destinationRetrievalService'
import { DestinationRetrievalService } from '@/services/destinations/destinationRetrievalService'
import type { RankedDestinationCandidate } from '@/services/destinations/types'
import { calculateMockTripBudgetEstimate } from '@/services/travel/budget/mockTripBudgetEstimate'
import { resolveTravelCurrency } from '@/services/travel/currencyPolicy'
import { FlightSearchService } from '@/services/travel/flights/flightSearchService'
import type { FlightOption, FlightSearchResult } from '@/services/travel/flights/types'
import { HotelSearchService } from '@/services/travel/hotels/hotelSearchService'
import type { HotelOption, HotelSearchResult } from '@/services/travel/hotels/types'
import { rankCandidatesForHotelArea } from '@/services/travel/planning/hotelAreaInfluence'
import {
  createMockTripTravelSelection,
  type MockTripTravelSelection,
} from '@/services/travel/planning/mockTravelSelection'
import {
  buildTravelTimingConstraints,
  type TravelTimingConstraints,
} from '@/services/travel/planning/travelTiming'

export interface PhuQuocGoldenMockScenario {
  input: {
    origin: 'Kuala Lumpur'
    destination: 'Phu Quoc'
    duration: '4D3N'
    travellers: '2 adults'
    rooms: 1
    budget: 'medium'
    interests: string[]
    pace: 'balanced'
  }
  flightSearch: FlightSearchResult
  hotelSearch: HotelSearchResult
  selectedOutboundFlight: FlightOption
  selectedReturnFlight: FlightOption
  selectedHotel: HotelOption
  selection: MockTripTravelSelection
  budgetEstimate: ReturnType<typeof calculateMockTripBudgetEstimate>
  timing: TravelTimingConstraints
  retrievalCandidateRecommendations: Array<
    Pick<
      RankedDestinationCandidate,
      'candidateId' | 'name' | 'categories' | 'tags' | 'rankScore'
    > & {
      hotelAreaScore: number
      adjustedRankScore: number
    }
  >
  itineraryPlanningContext: {
    selectedTravel: MockTripTravelSelection
    timing: TravelTimingConstraints
    budgetEstimate: ReturnType<typeof calculateMockTripBudgetEstimate>
    candidateScheduleProposal: Array<{
      candidateId: string
      name: string
      suggestedWindow: 'arrival_evening' | 'full_day' | 'departure_morning'
    }>
    aiItineraryStatus: 'not_generated_quota_or_provider_required'
  }
}

function chooseOutbound(options: FlightOption[]): FlightOption {
  return options.find((option) => option.departureAt.slice(11, 13) === '08') ?? options[0]
}

function chooseReturn(options: FlightOption[]): FlightOption {
  return options.find((option) => option.departureAt.slice(11, 13) === '15') ?? options[0]
}

function chooseHotel(options: HotelOption[]): HotelOption {
  return options.find((option) => option.area === 'long_beach') ?? options[0]
}

function suggestedWindow(
  candidate: Pick<RankedDestinationCandidate, 'categories' | 'tags'>
): 'arrival_evening' | 'full_day' | 'departure_morning' {
  const tags = new Set([...candidate.categories, ...candidate.tags])
  if (tags.has('night_market') || tags.has('food')) return 'arrival_evening'
  if (tags.has('market') || tags.has('beach')) return 'departure_morning'
  return 'full_day'
}

export async function createPhuQuocGoldenMockScenario(): Promise<PhuQuocGoldenMockScenario> {
  const currency = resolveTravelCurrency({ originAirportCode: 'KUL' }).currency
  const flightSearch = await new FlightSearchService().search({
    destination: 'Phu Quoc',
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    travellers: 2,
    cabinClass: 'economy',
    currency,
  })
  const hotelSearch = await new HotelSearchService().search({
    destination: 'Phu Quoc',
    checkInDate: '2026-09-12',
    checkOutDate: '2026-09-15',
    travellers: 2,
    rooms: 1,
    currency,
  })
  const selectedOutboundFlight = chooseOutbound(flightSearch.outboundOptions)
  const selectedReturnFlight = chooseReturn(flightSearch.returnOptions)
  const selectedHotel = chooseHotel(hotelSearch.options)
  const selection = createMockTripTravelSelection({
    selectedOutboundFlight,
    selectedReturnFlight,
    selectedHotel,
    travellerCount: 2,
    roomCount: 1,
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    originAirportCode: 'KUL',
    destinationAirportCode: 'PQC',
    travelCurrency: currency,
    generatedEstimateAt: '2026-08-06T00:00:00.000Z',
  })
  const budgetEstimate = calculateMockTripBudgetEstimate({ selection, attractionsTotal: null })
  const timing = buildTravelTimingConstraints(selection)
  const city = await resolveDestinationCity('Phu Quoc')
  const retrieval = city
    ? await new DestinationRetrievalService().retrieve({
        cityId: city.id,
        travelStyles: ['balanced'],
        interests: ['beach', 'nature', 'local food', 'cable car', 'night market'],
        limitPerType: 20,
      })
    : { candidates: [] as RankedDestinationCandidate[] }
  const retrievalCandidateRecommendations = rankCandidatesForHotelArea(
    retrieval.candidates,
    selectedHotel.area
  ).slice(0, 10)
  const candidateScheduleProposal = retrievalCandidateRecommendations
    .slice(0, 8)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      name: candidate.name,
      suggestedWindow: suggestedWindow(candidate),
    }))

  return {
    input: {
      origin: 'Kuala Lumpur',
      destination: 'Phu Quoc',
      duration: '4D3N',
      travellers: '2 adults',
      rooms: 1,
      budget: 'medium',
      interests: ['beach', 'nature', 'local food', 'cable car', 'night market'],
      pace: 'balanced',
    },
    flightSearch,
    hotelSearch,
    selectedOutboundFlight,
    selectedReturnFlight,
    selectedHotel,
    selection,
    budgetEstimate,
    timing,
    retrievalCandidateRecommendations,
    itineraryPlanningContext: {
      selectedTravel: selection,
      timing,
      budgetEstimate,
      candidateScheduleProposal,
      aiItineraryStatus: 'not_generated_quota_or_provider_required',
    },
  }
}
