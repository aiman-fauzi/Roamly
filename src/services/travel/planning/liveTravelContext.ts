import type { RankedDestinationCandidate } from '@/services/destinations/types'
import type { TripBudgetCostSummary, TripBudgetSummary } from '@/services/travel/budget/types'
import type { FlightOffer, HotelOffer } from '@/services/travel/offers/types'
import { rankCandidatesForHotelArea } from '@/services/travel/planning/hotelAreaInfluence'
import { createMockTripTravelSelection } from '@/services/travel/planning/mockTravelSelection'
import {
  buildTravelTimingConstraints,
  type TravelTimingConstraints,
} from '@/services/travel/planning/travelTiming'

export type PhuQuocAreaGroup =
  | 'north_phu_quoc'
  | 'central_duong_dong'
  | 'long_beach'
  | 'south_phu_quoc'
  | 'hon_thom_island'

export interface PlanningPreviewCandidate {
  candidateId: string
  name: string
  categories: string[]
  areaGroup: PhuQuocAreaGroup
  adjustedRankScore: number
}

export interface ItineraryTravelContext {
  outboundFlight: NonNullable<FlightOffer['mockFlightPair']>['outbound']
  returnFlight: NonNullable<FlightOffer['mockFlightPair']>['return']
  hotel: NonNullable<HotelOffer['mockHotel']>['option']
  arrivalTiming: {
    arrivalAt: string
    usableDayStart: string
    recommendation: 'arrival_only' | 'light_evening' | 'half_day' | 'normal_day'
  }
  departureTiming: {
    departureAt: string
    latestHotelDeparture: string
    recommendation: 'no_activity' | 'nearby_morning_activity' | 'half_day'
  }
  hotelArea: PhuQuocAreaGroup
  hotelCoordinates: {
    latitude: number
    longitude: number
  }
  timing: TravelTimingConstraints
  budget: TripBudgetCostSummary
  planningPreview: {
    status: 'planning_preview'
    strictCandidateIds: boolean
    rankedRecommendations: PlanningPreviewCandidate[]
    arrivalDayRecommendations: PlanningPreviewCandidate[]
    fullDayCandidateGroups: Array<{
      areaGroup: PhuQuocAreaGroup
      candidates: PlanningPreviewCandidate[]
    }>
    finalDayRecommendations: PlanningPreviewCandidate[]
  }
  dataStatus: 'mock'
}

const FULL_DAY_CATEGORIES = new Set([
  'cable_car',
  'island',
  'national_park',
  'safari',
  'theme_park',
])

const LIGHT_ARRIVAL_CATEGORIES = new Set([
  'beach',
  'culture',
  'food',
  'local_experience',
  'market',
  'night_market',
  'religious',
])

function uniqueCategories(candidate: Pick<RankedDestinationCandidate, 'categories' | 'tags'>) {
  return [...new Set([...candidate.categories, ...candidate.tags])]
}

export function phuQuocAreaGroupForCandidate(
  candidate: Pick<RankedDestinationCandidate, 'categories' | 'tags' | 'latitude' | 'longitude'>
): PhuQuocAreaGroup {
  const categories = uniqueCategories(candidate)
  if (categories.some((category) => category === 'cable_car' || category === 'island')) {
    return 'hon_thom_island'
  }
  if (candidate.latitude >= 10.28) return 'north_phu_quoc'
  if (candidate.latitude <= 10.07 || candidate.longitude >= 104.0) return 'south_phu_quoc'
  if (categories.includes('beach') && candidate.latitude >= 10.1 && candidate.latitude <= 10.22) {
    return 'long_beach'
  }
  return 'central_duong_dong'
}

function hotelAreaGroup(area: NonNullable<HotelOffer['mockHotel']>['area']): PhuQuocAreaGroup {
  if (area === 'north_phu_quoc') return 'north_phu_quoc'
  if (area === 'south_phu_quoc') return 'south_phu_quoc'
  if (area === 'long_beach') return 'long_beach'
  return 'central_duong_dong'
}

function arrivalRecommendation(
  timing: TravelTimingConstraints
): ItineraryTravelContext['arrivalTiming']['recommendation'] {
  if (!timing.dayOne.usableStartAt) return 'arrival_only'
  if (timing.dayOne.recommendation === 'light_nearby_evening') return 'light_evening'
  if (timing.dayOne.recommendation === 'half_day_nearby') return 'half_day'
  return 'normal_day'
}

function departureRecommendation(
  timing: TravelTimingConstraints
): ItineraryTravelContext['departureTiming']['recommendation'] {
  if (!timing.finalDay.latestHotelDepartureAt) return 'no_activity'
  if (timing.finalDay.recommendation === 'airport_transfer_only') return 'no_activity'
  if (timing.finalDay.recommendation === 'nearby_morning_activity') {
    return 'nearby_morning_activity'
  }
  return 'half_day'
}

function toPreviewCandidate(
  candidate: RankedDestinationCandidate & { adjustedRankScore: number }
): PlanningPreviewCandidate {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    categories: candidate.categories,
    areaGroup: phuQuocAreaGroupForCandidate(candidate),
    adjustedRankScore: candidate.adjustedRankScore,
  }
}

function groupCandidates(candidates: PlanningPreviewCandidate[]) {
  const groups = new Map<PhuQuocAreaGroup, PlanningPreviewCandidate[]>()
  for (const candidate of candidates) {
    const items = groups.get(candidate.areaGroup) ?? []
    items.push(candidate)
    groups.set(candidate.areaGroup, items)
  }
  return [...groups.entries()].map(([areaGroup, items]) => ({
    areaGroup,
    candidates: items.slice(0, 4),
  }))
}

function arrivalCandidates(
  candidates: PlanningPreviewCandidate[],
  timing: TravelTimingConstraints,
  hotelArea: PhuQuocAreaGroup
) {
  const limited = timing.dayOne.recommendation !== 'normal_day'
  return candidates
    .filter((candidate) => {
      const categories = new Set(candidate.categories)
      if (limited && [...FULL_DAY_CATEGORIES].some((category) => categories.has(category))) {
        return false
      }
      if (!limited) return true
      return (
        candidate.areaGroup === hotelArea ||
        [...LIGHT_ARRIVAL_CATEGORIES].some((category) => categories.has(category))
      )
    })
    .slice(0, limited ? 4 : 6)
}

function finalDayCandidates(
  candidates: PlanningPreviewCandidate[],
  timing: TravelTimingConstraints,
  hotelArea: PhuQuocAreaGroup
) {
  const constrained = timing.finalDay.recommendation !== 'normal_morning'
  return candidates
    .filter((candidate) => {
      const categories = new Set(candidate.categories)
      if (constrained && [...FULL_DAY_CATEGORIES].some((category) => categories.has(category))) {
        return false
      }
      return (
        !constrained ||
        candidate.areaGroup === hotelArea ||
        categories.has('market') ||
        categories.has('beach')
      )
    })
    .slice(0, constrained ? 4 : 6)
}

export function buildItineraryTravelContext(input: {
  selectedFlightOffer: FlightOffer
  selectedHotelOffer: HotelOffer
  budgetSummary: TripBudgetSummary
  departureDate: string
  returnDate: string
  originAirportCode: string
  destinationAirportCode: string
  travellerCount: number
  roomCount: number
  generatedEstimateAt?: string
  destinationCandidates: RankedDestinationCandidate[]
}): ItineraryTravelContext {
  const flightPair = input.selectedFlightOffer.mockFlightPair
  const hotel = input.selectedHotelOffer.mockHotel
  if (!flightPair || !hotel) {
    throw new Error('Trusted mock flight and hotel metadata are required for travel planning.')
  }

  const selection = createMockTripTravelSelection({
    selectedOutboundFlight: flightPair.outbound,
    selectedReturnFlight: flightPair.return,
    selectedHotel: hotel.option,
    travellerCount: input.travellerCount,
    roomCount: input.roomCount,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    originAirportCode: input.originAirportCode,
    destinationAirportCode: input.destinationAirportCode,
    travelCurrency: input.budgetSummary.currency,
    generatedEstimateAt: input.generatedEstimateAt,
  })
  const timing = buildTravelTimingConstraints(selection)
  const hotelArea = hotelAreaGroup(hotel.area)
  const rankedRecommendations = rankCandidatesForHotelArea(
    input.destinationCandidates.filter((candidate) => candidate.entityType === 'ATTRACTION'),
    hotel.area
  )
    .map(toPreviewCandidate)
    .slice(0, 12)

  return {
    outboundFlight: flightPair.outbound,
    returnFlight: flightPair.return,
    hotel: hotel.option,
    arrivalTiming: {
      arrivalAt: flightPair.outbound.arrivalAt,
      usableDayStart: timing.dayOne.usableStartAt ?? flightPair.outbound.arrivalAt,
      recommendation: arrivalRecommendation(timing),
    },
    departureTiming: {
      departureAt: flightPair.return.departureAt,
      latestHotelDeparture: timing.finalDay.latestHotelDepartureAt ?? flightPair.return.departureAt,
      recommendation: departureRecommendation(timing),
    },
    hotelArea,
    hotelCoordinates: {
      latitude: hotel.option.latitude,
      longitude: hotel.option.longitude,
    },
    timing,
    budget: requireCostSummary(input.budgetSummary),
    planningPreview: {
      status: 'planning_preview',
      strictCandidateIds: rankedRecommendations.every((candidate) =>
        /^ATTRACTION:[0-9a-f-]{36}$/i.test(candidate.candidateId)
      ),
      rankedRecommendations,
      arrivalDayRecommendations: arrivalCandidates(rankedRecommendations, timing, hotelArea),
      fullDayCandidateGroups: groupCandidates(rankedRecommendations),
      finalDayRecommendations: finalDayCandidates(rankedRecommendations, timing, hotelArea),
    },
    dataStatus: 'mock',
  }
}

function requireCostSummary(summary: TripBudgetSummary): TripBudgetCostSummary {
  if (!summary.costSummary) {
    throw new Error('Trusted budget cost summary is required for travel planning.')
  }
  return summary.costSummary
}
