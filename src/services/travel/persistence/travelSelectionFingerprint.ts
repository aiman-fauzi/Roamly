import { buildOfferSearchFingerprint } from '@/services/travel/offers/offerCache'

export const TRAVEL_SELECTION_FINGERPRINT_VERSION = 1
export const TRAVEL_SELECTION_PROVIDER = 'mock' as const

export interface TravelSelectionFingerprintInput {
  destination: string
  originAirportCode: string
  destinationAirportCode: string
  outboundDate: string
  returnDate: string
  travellers: number
  rooms: number
  cabinClass: string
  currency: string
  provider?: typeof TRAVEL_SELECTION_PROVIDER
}

export function buildTravelSelectionFingerprint(input: TravelSelectionFingerprintInput): string {
  return buildOfferSearchFingerprint({
    fingerprintVersion: TRAVEL_SELECTION_FINGERPRINT_VERSION,
    destination: input.destination.trim().toLowerCase(),
    originAirport: input.originAirportCode.trim().toUpperCase(),
    destinationAirport: input.destinationAirportCode.trim().toUpperCase(),
    outboundDate: input.outboundDate,
    returnDate: input.returnDate,
    travellers: input.travellers,
    rooms: input.rooms,
    cabinClass: input.cabinClass.trim().toUpperCase(),
    currency: input.currency.trim().toUpperCase(),
    provider: input.provider ?? TRAVEL_SELECTION_PROVIDER,
  })
}
