import type {
  DestinationCluster,
  DestinationNearestNeighbor,
  RankedDestinationCandidate,
} from '@/services/destinations/types'

const EARTH_RADIUS_KM = 6371

export interface GeoPoint {
  latitude: number
  longitude: number
}

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    !(point.latitude === 0 && point.longitude === 0)
  )
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function haversineDistanceKm(first: GeoPoint, second: GeoPoint): number {
  const latDelta = toRadians(second.latitude - first.latitude)
  const lonDelta = toRadians(second.longitude - first.longitude)
  const firstLat = toRadians(first.latitude)
  const secondLat = toRadians(second.latitude)

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lonDelta / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_KM * c
}

export function buildNearestNeighbors(
  candidates: RankedDestinationCandidate[],
  maxNeighbors = 3
): DestinationNearestNeighbor[] {
  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    neighbors: candidates
      .filter((other) => other.candidateId !== candidate.candidateId)
      .map((other) => ({
        candidateId: other.candidateId,
        distanceKm: Number(
          haversineDistanceKm(
            { latitude: candidate.latitude, longitude: candidate.longitude },
            { latitude: other.latitude, longitude: other.longitude }
          ).toFixed(2)
        ),
      }))
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, maxNeighbors),
  }))
}

export function groupNearbyCandidates(
  candidates: RankedDestinationCandidate[],
  radiusKm = 2
): DestinationCluster[] {
  const remaining = [...candidates].sort((first, second) => second.rankScore - first.rankScore)
  const clusters: DestinationCluster[] = []

  while (remaining.length > 0) {
    const seed = remaining.shift()
    if (!seed) break

    const group = [seed]
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index]
      const distance = haversineDistanceKm(
        { latitude: seed.latitude, longitude: seed.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude }
      )

      if (distance <= radiusKm) {
        group.push(candidate)
        remaining.splice(index, 1)
      }
    }

    const centerLatitude =
      group.reduce((total, candidate) => total + candidate.latitude, 0) / group.length
    const centerLongitude =
      group.reduce((total, candidate) => total + candidate.longitude, 0) / group.length
    const averageRankScore =
      group.reduce((total, candidate) => total + candidate.rankScore, 0) / group.length

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      centerLatitude: Number(centerLatitude.toFixed(6)),
      centerLongitude: Number(centerLongitude.toFixed(6)),
      candidateIds: group.map((candidate) => candidate.candidateId),
      averageRankScore: Number(averageRankScore.toFixed(1)),
    })
  }

  return clusters.sort((first, second) => second.averageRankScore - first.averageRankScore)
}

export function suggestDailyClusters(
  clusters: DestinationCluster[],
  durationDays: number
): DestinationCluster[] {
  if (durationDays <= 0) return []
  return [...clusters]
    .sort((first, second) => second.averageRankScore - first.averageRankScore)
    .slice(0, durationDays)
}
