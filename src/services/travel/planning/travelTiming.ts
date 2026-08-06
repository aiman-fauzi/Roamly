import type { MockTripTravelSelection } from './mockTravelSelection'

const IMMIGRATION_MINUTES = 45
const BAGGAGE_MINUTES = 25
const AIRPORT_TRANSFER_MINUTES = 45
const CHECK_IN_BUFFER_MINUTES = 30
const AIRPORT_CHECK_IN_MINUTES = 120
const HOTEL_CHECKOUT_HOUR = 11

function addMinutes(iso: string, minutes: number): Date {
  return new Date(new Date(iso).getTime() + minutes * 60_000)
}

function dayAt(date: string, hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute
    )
  )
}

function localTimeLabel(date: Date): string {
  return date.toISOString().slice(11, 16)
}

export interface TravelTimingConstraints {
  dayOne: {
    arrivalAt: string | null
    usableStartAt: string | null
    usableStartTime: string | null
    lateArrival: boolean
    recommendation: 'light_nearby_evening' | 'half_day_nearby' | 'normal_day'
    assumptions: string[]
  }
  finalDay: {
    departureAt: string | null
    latestHotelDepartureAt: string | null
    latestHotelDepartureTime: string | null
    earlyDeparture: boolean
    recommendation: 'airport_transfer_only' | 'nearby_morning_activity' | 'normal_morning'
    assumptions: string[]
  }
}

export function buildTravelTimingConstraints(
  selection: MockTripTravelSelection
): TravelTimingConstraints {
  const arrivalAt = selection.selectedOutboundFlight?.arrivalAt ?? null
  const usableStart = arrivalAt
    ? addMinutes(
        arrivalAt,
        IMMIGRATION_MINUTES + BAGGAGE_MINUTES + AIRPORT_TRANSFER_MINUTES + CHECK_IN_BUFFER_MINUTES
      )
    : null
  const lateArrival = usableStart ? usableStart.getUTCHours() >= 17 : false
  const afternoonArrival = usableStart ? usableStart.getUTCHours() >= 13 : false
  const departureAt = selection.selectedReturnFlight?.departureAt ?? null
  const latestHotelDeparture = departureAt
    ? addMinutes(departureAt, -(AIRPORT_TRANSFER_MINUTES + AIRPORT_CHECK_IN_MINUTES))
    : null
  const checkout = dayAt(selection.returnDate, HOTEL_CHECKOUT_HOUR)
  const earlyDeparture = latestHotelDeparture ? latestHotelDeparture <= checkout : false

  return {
    dayOne: {
      arrivalAt,
      usableStartAt: usableStart?.toISOString() ?? null,
      usableStartTime: usableStart ? localTimeLabel(usableStart) : null,
      lateArrival,
      recommendation: lateArrival
        ? 'light_nearby_evening'
        : afternoonArrival
          ? 'half_day_nearby'
          : 'normal_day',
      assumptions: [
        `${IMMIGRATION_MINUTES} minutes immigration buffer`,
        `${BAGGAGE_MINUTES} minutes baggage buffer`,
        `${AIRPORT_TRANSFER_MINUTES} minutes estimated airport transfer`,
        'Hotel check-in or baggage-drop buffer included',
      ],
    },
    finalDay: {
      departureAt,
      latestHotelDepartureAt: latestHotelDeparture?.toISOString() ?? null,
      latestHotelDepartureTime: latestHotelDeparture ? localTimeLabel(latestHotelDeparture) : null,
      earlyDeparture,
      recommendation: earlyDeparture
        ? 'airport_transfer_only'
        : latestHotelDeparture && latestHotelDeparture.getUTCHours() < 14
          ? 'nearby_morning_activity'
          : 'normal_morning',
      assumptions: [
        `${AIRPORT_TRANSFER_MINUTES} minutes estimated airport transfer`,
        `${AIRPORT_CHECK_IN_MINUTES} minutes airport check-in buffer`,
        `Hotel checkout assumed at ${String(HOTEL_CHECKOUT_HOUR).padStart(2, '0')}:00`,
      ],
    },
  }
}
