import type { RankedDestinationCandidate } from '@/services/destinations/types'
import type { PhuQuocHotelArea } from '@/services/travel/hotels/types'

const AREA_CATEGORY_WEIGHTS: Record<PhuQuocHotelArea, Record<string, number>> = {
  duong_dong: {
    night_market: 28,
    market: 24,
    food: 18,
    culture: 12,
    beach: 8,
  },
  long_beach: {
    beach: 28,
    nature: 14,
    market: 10,
    food: 10,
    cable_car: 6,
  },
  south_phu_quoc: {
    cable_car: 28,
    local_experience: 24,
    island: 20,
    viewpoint: 14,
    beach: 12,
  },
  north_phu_quoc: {
    theme_park: 28,
    safari: 28,
    family: 20,
    nature: 10,
  },
}

export function hotelAreaPreferenceScore(
  candidate: Pick<RankedDestinationCandidate, 'categories' | 'tags'>,
  area: PhuQuocHotelArea
): { score: number; reasons: string[] } {
  const weights = AREA_CATEGORY_WEIGHTS[area]
  const categories = [...new Set([...candidate.categories, ...candidate.tags])]
  const reasons: string[] = []
  const score = categories.reduce((total, category) => {
    const weight = weights[category] ?? 0
    if (weight > 0) reasons.push(`${area} preference: ${category}`)
    return total + weight
  }, 0)
  return { score, reasons }
}

export function rankCandidatesForHotelArea<
  T extends Pick<RankedDestinationCandidate, 'categories' | 'tags' | 'rankScore'>,
>(
  candidates: T[],
  area: PhuQuocHotelArea
): Array<T & { hotelAreaScore: number; hotelAreaReasons: string[]; adjustedRankScore: number }> {
  return candidates
    .map((candidate) => {
      const preference = hotelAreaPreferenceScore(candidate, area)
      return {
        ...candidate,
        hotelAreaScore: preference.score,
        hotelAreaReasons: preference.reasons,
        adjustedRankScore: candidate.rankScore + preference.score,
      }
    })
    .sort((first, second) => second.adjustedRankScore - first.adjustedRankScore)
}
