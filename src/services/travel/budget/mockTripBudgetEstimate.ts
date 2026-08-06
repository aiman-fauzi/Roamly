import type { MockTripTravelSelection } from '@/services/travel/planning/mockTravelSelection'

export interface TripBudgetEstimate {
  currency: string
  travellers: number
  flightsTotal: number | null
  hotelTotal: number | null
  attractionsTotal: number | null
  foodTotal: number
  localTransportTotal: number
  contingencyTotal: number
  wholeTripTotal: number
  estimatedPerPersonTotal: number
  estimatedGrandTotal: number
  status: 'mock_estimate'
  missingEstimates: string[]
}

function known(values: Array<number | null>): number[] {
  return values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  )
}

export function calculateMockTripBudgetEstimate(input: {
  selection: MockTripTravelSelection
  attractionsTotal?: number | null
  dailyFoodPerTraveller?: number
  dailyLocalTransportPerTraveller?: number
  contingencyPercent?: number
}): TripBudgetEstimate {
  const travellers = Math.max(1, input.selection.travellerCount)
  const durationDays = Math.max(
    1,
    Math.round(
      (new Date(`${input.selection.returnDate}T00:00:00.000Z`).getTime() -
        new Date(`${input.selection.departureDate}T00:00:00.000Z`).getTime()) /
        86_400_000
    ) + 1
  )
  const flightsTotal =
    input.selection.selectedOutboundFlight && input.selection.selectedReturnFlight
      ? input.selection.selectedOutboundFlight.fare.totalAmount +
        input.selection.selectedReturnFlight.fare.totalAmount
      : null
  const hotelTotal = input.selection.selectedHotel?.pricing.totalAmount ?? null
  const attractionsTotal = input.attractionsTotal ?? null
  const foodTotal = (input.dailyFoodPerTraveller ?? 45) * travellers * durationDays
  const localTransportTotal =
    (input.dailyLocalTransportPerTraveller ?? 18) * travellers * durationDays
  const subtotal = known([
    flightsTotal,
    hotelTotal,
    attractionsTotal,
    foodTotal,
    localTransportTotal,
  ]).reduce((total, value) => total + value, 0)
  const contingencyTotal = Math.round(subtotal * ((input.contingencyPercent ?? 10) / 100))
  const missingEstimates = [
    flightsTotal == null ? 'No selected outbound and return flight pair.' : null,
    hotelTotal == null ? 'No selected hotel.' : null,
    attractionsTotal == null ? 'Attraction ticket estimates unavailable.' : null,
  ].filter((value): value is string => Boolean(value))

  const wholeTripTotal = subtotal + contingencyTotal

  return {
    currency: input.selection.travelCurrency,
    travellers,
    flightsTotal,
    hotelTotal,
    attractionsTotal,
    foodTotal,
    localTransportTotal,
    contingencyTotal,
    wholeTripTotal,
    estimatedPerPersonTotal: Math.round(wholeTripTotal / travellers),
    estimatedGrandTotal: wholeTripTotal,
    status: 'mock_estimate',
    missingEstimates,
  }
}
