import { haversineDistanceKm } from '@/services/destinations/geo'
import { compareMoney, parseMoneyMinorUnits } from '@/services/travel/offers/money'
import type {
  FlightOffer,
  FlightOfferSelectionStrategy,
  HotelOffer,
  HotelOfferSelectionStrategy,
  RankedFlightOffer,
  RankedHotelOffer,
} from '@/services/travel/offers/types'

function cheapestScore(offer: Pick<FlightOffer | HotelOffer, 'totalPrice'>, offers: Array<FlightOffer | HotelOffer>): number {
  const prices = offers.map((item) => parseMoneyMinorUnits(item.totalPrice))
  const highest = prices.reduce((max, value) => (value > max ? value : max), BigInt(0))
  if (highest === BigInt(0)) return 0
  const score = Number(((highest - parseMoneyMinorUnits(offer.totalPrice)) * BigInt(40)) / highest)
  return Math.max(0, score)
}

function cheapestOffer<T extends FlightOffer | HotelOffer>(offers: T[]): T | undefined {
  return [...offers].sort((first, second) => compareMoney(first.totalPrice, second.totalPrice))[0]
}

export function rankFlightOffers(
  offers: FlightOffer[],
  strategy: FlightOfferSelectionStrategy = 'BEST_VALUE'
): RankedFlightOffer[] {
  const cheapest = cheapestOffer(offers)

  return offers
    .map((offer) => {
      const duration = Math.min(...offer.itineraries.map((itinerary) => itinerary.durationMinutes))
      const stops = Math.min(...offer.itineraries.map((itinerary) => itinerary.stopCount))
      const rankReasons: string[] = []
      let rankScore = 0

      rankScore += cheapestScore(offer, offers)
      if (stops === 0) {
        rankScore += strategy === 'FEWEST_STOPS' ? 45 : 20
        rankReasons.push('nonstop')
      }
      if (duration <= 150) {
        rankScore += strategy === 'SHORTEST' ? 45 : 18
        rankReasons.push('short_duration')
      }
      if (offer.refundable) {
        rankScore += 8
        rankReasons.push('refundable')
      }
      if (strategy === 'CHEAPEST' && cheapest && compareMoney(offer.totalPrice, cheapest.totalPrice) === 0) {
        rankScore += 45
        rankReasons.push('cheapest')
      }

      return { ...offer, rankScore, rankReasons }
    })
    .sort((first, second) => {
      const scoreDelta = second.rankScore - first.rankScore
      if (scoreDelta !== 0) return scoreDelta
      return compareMoney(first.totalPrice, second.totalPrice)
    })
}

export function rankHotelOffers(
  offers: HotelOffer[],
  strategy: HotelOfferSelectionStrategy = 'BEST_VALUE',
  itineraryCenter?: { latitude: number; longitude: number }
): RankedHotelOffer[] {
  const cheapest = cheapestOffer(offers)

  return offers
    .map((offer) => {
      const distanceFromItineraryCenterKm =
        itineraryCenter && offer.coordinates
          ? haversineDistanceKm(itineraryCenter, offer.coordinates)
          : offer.distanceFromItineraryCenterKm
      const rankReasons: string[] = []
      let rankScore = cheapestScore(offer, offers)

      if (offer.refundable) {
        rankScore += strategy === 'REFUNDABLE' ? 45 : 15
        rankReasons.push('refundable')
      }
      if (distanceFromItineraryCenterKm != null && distanceFromItineraryCenterKm <= 2) {
        rankScore += strategy === 'NEAREST_TO_ITINERARY' ? 45 : 20
        rankReasons.push('near_itinerary_center')
      }
      if (strategy === 'CHEAPEST' && cheapest && compareMoney(offer.totalPrice, cheapest.totalPrice) === 0) {
        rankScore += 45
        rankReasons.push('cheapest')
      }

      return { ...offer, distanceFromItineraryCenterKm, rankScore, rankReasons }
    })
    .sort((first, second) => {
      const scoreDelta = second.rankScore - first.rankScore
      if (scoreDelta !== 0) return scoreDelta
      return compareMoney(first.totalPrice, second.totalPrice)
    })
}

export function selectFlightOffer(
  offers: FlightOffer[],
  strategy: FlightOfferSelectionStrategy = 'BEST_VALUE',
  selectedOfferId?: string
): RankedFlightOffer | null {
  const ranked = rankFlightOffers(offers, strategy)
  if (!selectedOfferId) return ranked[0] ?? null
  return ranked.find((offer) => offer.id === selectedOfferId) ?? null
}

export function selectHotelOffer(
  offers: HotelOffer[],
  strategy: HotelOfferSelectionStrategy = 'BEST_VALUE',
  selectedOfferId?: string,
  itineraryCenter?: { latitude: number; longitude: number }
): RankedHotelOffer | null {
  const ranked = rankHotelOffers(offers, strategy, itineraryCenter)
  if (!selectedOfferId) return ranked[0] ?? null
  return ranked.find((offer) => offer.id === selectedOfferId) ?? null
}
