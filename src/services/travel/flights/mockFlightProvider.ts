import type { FlightProvider } from './flightProvider'
import type { FlightOption, FlightSearchInput, FlightSearchResult } from './types'

import {
  createDeterministicRandom,
  deterministicSeed,
} from '@/services/travel/mock/deterministicSeed'
import {
  PHU_QUOC_AIRPORTS,
  PHU_QUOC_MOCK_FLIGHTS,
} from '@/services/travel/mock/phuQuocMockFixtures'

function isoAt(date: string, hour: number, minute: number): string {
  return new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute
    )
  ).toISOString()
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function cabinMultiplier(cabinClass: FlightSearchInput['cabinClass']): number {
  if (cabinClass === 'business') return 2.45
  if (cabinClass === 'premium_economy') return 1.55
  return 1
}

export class MockFlightProvider implements FlightProvider {
  readonly providerKey = 'mock'

  async searchFlights(input: FlightSearchInput): Promise<FlightSearchResult> {
    const seedInput = {
      destination: input.destination,
      origin: input.originAirportCode,
      destinationAirport: input.destinationAirportCode,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      travellers: input.travellers,
      cabinClass: input.cabinClass,
      currency: input.currency,
    }
    const random = createDeterministicRandom(seedInput)
    const seed = deterministicSeed(seedInput)
    const makeOption = (
      fixture: (typeof PHU_QUOC_MOCK_FLIGHTS)[number],
      date: string
    ): FlightOption => {
      const priceOffset = random.int(-18, 22)
      const perTravellerBaseAmount = Math.max(
        80,
        Math.round((fixture.baseFare + priceOffset) * cabinMultiplier(input.cabinClass))
      )
      const perTravellerTaxesAmount = Math.round(perTravellerBaseAmount * 0.16)
      const perTravellerTotalAmount = perTravellerBaseAmount + perTravellerTaxesAmount
      const travellerCount = Math.max(1, input.travellers)
      const baseAmount = perTravellerBaseAmount * travellerCount
      const taxesAmount = perTravellerTaxesAmount * travellerCount
      const departureAt = isoAt(date, fixture.departureHour, fixture.departureMinute)
      const originAirportCode =
        fixture.direction === 'outbound' ? input.originAirportCode : input.destinationAirportCode
      const destinationAirportCode =
        fixture.direction === 'outbound' ? input.destinationAirportCode : input.originAirportCode

      return {
        id: `mock-${fixture.id}-${seed.toString(16).slice(0, 8)}`,
        provider: 'mock',
        direction: fixture.direction,
        airlineCode: fixture.airlineCode,
        airlineName: fixture.airlineName,
        flightNumber: `${fixture.airlineCode}${fixture.flightNumberSeed + random.int(0, 19)}`,
        originAirportCode,
        originAirportName:
          PHU_QUOC_AIRPORTS[originAirportCode as keyof typeof PHU_QUOC_AIRPORTS] ??
          originAirportCode,
        destinationAirportCode,
        destinationAirportName:
          PHU_QUOC_AIRPORTS[destinationAirportCode as keyof typeof PHU_QUOC_AIRPORTS] ??
          destinationAirportCode,
        departureAt,
        arrivalAt: addMinutes(departureAt, fixture.durationMinutes),
        durationMinutes: fixture.durationMinutes,
        stops: 0,
        cabinClass: input.cabinClass,
        travellerCount,
        baggage: {
          cabinKg: 7,
          checkedKg:
            input.cabinClass === 'business' ? 40 : input.cabinClass === 'premium_economy' ? 25 : 20,
        },
        fare: {
          perTravellerBaseAmount,
          perTravellerTaxesAmount,
          perTravellerTotalAmount,
          baseAmount,
          taxesAmount,
          totalAmount: baseAmount + taxesAmount,
          currency: input.currency,
        },
        refundable: fixture.refundable,
        changeable: fixture.changeable,
        dataStatus: 'mock',
        availabilityStatus: 'simulated',
      }
    }

    return {
      provider: 'mock',
      dataStatus: 'mock',
      availabilityStatus: 'simulated',
      seed,
      outboundOptions: PHU_QUOC_MOCK_FLIGHTS.filter(
        (fixture) => fixture.direction === 'outbound'
      ).map((fixture) => makeOption(fixture, input.departureDate)),
      returnOptions: PHU_QUOC_MOCK_FLIGHTS.filter((fixture) => fixture.direction === 'return').map(
        (fixture) => makeOption(fixture, input.returnDate)
      ),
    }
  }
}
