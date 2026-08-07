import type * as Leaflet from 'leaflet'

import type {
  ItineraryMapAdapter,
  ItineraryMapRenderState,
} from './ItineraryMapAdapter'

import { groupItineraryMapPointsByDay } from '@/lib/maps/itineraryMapPoints'
import type { ItineraryMapPoint } from '@/types/itinerary'

const DAY_COLORS = ['#4357c8', '#168c7b', '#c77d18', '#8b5a9f', '#b64c52', '#27748a']

function dayColor(dayNumber: number): string {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length]
}

export async function createLeafletItineraryMapAdapter(
  container: HTMLElement,
  onTileFailure: () => void
): Promise<ItineraryMapAdapter> {
  const L = await import('leaflet')
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
  }).setView([0, 0], 2)
  let tileFailureReported = false
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })
  tiles.on('tileerror', () => {
    if (tileFailureReported) return
    tileFailureReported = true
    onTileFailure()
  })
  tiles.addTo(map)

  const markers = new Map<string, Leaflet.Marker>()
  const markerPoints = new Map<string, ItineraryMapPoint>()
  const routeLines: Leaflet.Polyline[] = []
  let currentState: ItineraryMapRenderState | null = null

  function clearLayers() {
    for (const marker of markers.values()) marker.removeFrom(map)
    for (const line of routeLines) line.removeFrom(map)
    markers.clear()
    markerPoints.clear()
    routeLines.splice(0)
  }

  function applyEmphasis(dayNumber: number | null, selectedItemId: string | null) {
    for (const [itemId, marker] of markers) {
      const point = markerPoints.get(itemId)
      const muted = dayNumber != null && point?.dayNumber !== dayNumber
      marker.setOpacity(muted ? 0.3 : 1)
      const element = marker.getElement()
      element?.classList.toggle('is-selected', itemId === selectedItemId)
      element?.classList.toggle('is-muted', muted)
    }
    routeLines.forEach((line) => {
      const lineDay = Number((line.options as Leaflet.PolylineOptions & { roamlyDay?: number }).roamlyDay)
      line.setStyle({ opacity: dayNumber == null || lineDay === dayNumber ? 0.72 : 0.12 })
    })
  }

  const adapter: ItineraryMapAdapter = {
    render(points, state) {
      clearLayers()
      currentState = state
      for (const group of groupItineraryMapPointsByDay(points)) {
        if (group.points.length > 1) {
          const line = L.polyline(
            group.points.map((point) => [point.latitude, point.longitude]),
            {
              color: dayColor(group.dayNumber),
              weight: 4,
              opacity: 0.72,
              dashArray: '7 8',
              lineCap: 'round',
              roamlyDay: group.dayNumber,
            } as Leaflet.PolylineOptions & { roamlyDay: number }
          ).addTo(map)
          routeLines.push(line)
        }
        group.points.forEach((point, dayIndex) => {
          const locked = state.lockedItemIds.has(point.itemId)
          const marker = L.marker([point.latitude, point.longitude], {
            keyboard: true,
            title: `${point.title}, Day ${point.dayNumber}, stop ${dayIndex + 1}${locked ? ', locked' : ''}`,
            alt: point.title,
            icon: L.divIcon({
              className: 'roamly-map-marker-shell',
              html: `<span class="roamly-map-marker${locked ? ' is-locked' : ''}" style="--marker-color:${dayColor(point.dayNumber)}"><small>D${point.dayNumber}</small><strong>${dayIndex + 1}</strong>${locked ? '<i aria-hidden="true">L</i>' : ''}</span>`,
              iconSize: [40, 48],
              iconAnchor: [20, 44],
              popupAnchor: [0, -42],
            }),
          }).addTo(map)
          const tooltip = document.createElement('span')
          tooltip.textContent = point.title
          marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -35] })
          marker.on('click', () => currentState?.onPointSelect(point.itemId))
          markers.set(point.itemId, marker)
          markerPoints.set(point.itemId, point)
        })
      }
      applyEmphasis(state.selectedDayNumber, state.selectedItemId)
    },
    fitBounds(points) {
      if (points.length === 0) return
      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 13, { animate: false })
        return
      }
      map.fitBounds(
        L.latLngBounds(points.map((point) => [point.latitude, point.longitude])),
        { padding: [38, 38], maxZoom: 14, animate: false }
      )
    },
    highlightPoint(itemId, animate) {
      const point = markerPoints.get(itemId)
      if (!point) return
      applyEmphasis(currentState?.selectedDayNumber ?? null, itemId)
      const destination = L.latLng(point.latitude, point.longitude)
      if (animate) map.flyTo(destination, Math.max(map.getZoom(), 13), { duration: 0.7 })
      else map.panTo(destination, { animate: false })
      markers.get(itemId)?.openTooltip()
    },
    highlightDay(dayNumber) {
      applyEmphasis(dayNumber, currentState?.selectedItemId ?? null)
      const points = [...markerPoints.values()].filter(
        (point) => dayNumber == null || point.dayNumber === dayNumber
      )
      adapter.fitBounds(points)
    },
    destroy() {
      clearLayers()
      map.remove()
    },
  }

  window.setTimeout(() => map.invalidateSize(), 0)
  return adapter
}
