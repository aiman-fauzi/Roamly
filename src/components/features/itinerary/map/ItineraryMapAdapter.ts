import type { ItineraryMapPoint } from '@/types/itinerary'

export interface ItineraryMapRenderState {
  lockedItemIds: ReadonlySet<string>
  selectedItemId: string | null
  selectedDayNumber: number | null
  onPointSelect: (itemId: string) => void
}

export interface ItineraryMapAdapter {
  render(points: ItineraryMapPoint[], state: ItineraryMapRenderState): void
  fitBounds(points: ItineraryMapPoint[]): void
  highlightPoint(itemId: string, animate: boolean): void
  highlightDay(dayNumber: number | null): void
  destroy(): void
}
