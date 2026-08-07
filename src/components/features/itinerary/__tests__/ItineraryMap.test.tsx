import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ItineraryMap } from '../ItineraryMap'

import type { ItineraryMapPoint } from '@/types/itinerary'

const mapHarness = vi.hoisted(() => ({
  adapter: {
    render: vi.fn(),
    fitBounds: vi.fn(),
    highlightPoint: vi.fn(),
    highlightDay: vi.fn(),
    destroy: vi.fn(),
  },
  create: vi.fn(),
}))

vi.mock('../map/leafletItineraryMapAdapter', () => ({
  createLeafletItineraryMapAdapter: mapHarness.create,
}))

const A = 'ATTRACTION:11111111-1111-4111-8111-111111111111'
const B = 'ATTRACTION:22222222-2222-4222-8222-222222222222'

function point(itemId: string, candidateId: string, orderIndex: number): ItineraryMapPoint {
  return {
    itemId,
    candidateId,
    dayNumber: 1,
    orderIndex,
    title: itemId,
    latitude: 10.2 + orderIndex * 0.01,
    longitude: 103.9,
    category: 'sight',
    areaGroup: null,
  }
}

const points = [point('item-a', A, 0), point('item-b', B, 1)]

function installMatchMedia(reduced = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

describe('ItineraryMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapHarness.create.mockResolvedValue(mapHarness.adapter)
    installMatchMedia(false)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  it('renders ordered points and synchronizes marker selection back to the editor', async () => {
    const onSelectItem = vi.fn()
    render(
      <ItineraryMap
        points={points}
        lockedItemIds={new Set(['item-a'])}
        selectedItemId="item-a"
        onSelectItem={onSelectItem}
      />
    )

    await waitFor(() => expect(mapHarness.adapter.render).toHaveBeenCalled())
    const state = mapHarness.adapter.render.mock.calls.at(-1)?.[1]
    expect(mapHarness.adapter.render.mock.calls.at(-1)?.[0]).toEqual(points)

    act(() => state.onPointSelect('item-b'))

    expect(onSelectItem).toHaveBeenCalledWith('item-b')
  })

  it('highlights editor selection without animated movement for reduced motion', async () => {
    installMatchMedia(true)
    const { rerender } = render(
      <ItineraryMap
        points={points}
        lockedItemIds={new Set()}
        selectedItemId="item-a"
        onSelectItem={vi.fn()}
      />
    )
    await waitFor(() => expect(mapHarness.adapter.render).toHaveBeenCalled())

    rerender(
      <ItineraryMap
        points={points}
        lockedItemIds={new Set()}
        selectedItemId="item-b"
        onSelectItem={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(mapHarness.adapter.highlightPoint).toHaveBeenCalledWith('item-b', false)
    )
  })

  it('supports play, next, previous, restart, and mobile expansion controls', async () => {
    const onSelectItem = vi.fn()
    render(
      <ItineraryMap
        points={points}
        lockedItemIds={new Set()}
        selectedItemId="item-a"
        onSelectItem={onSelectItem}
      />
    )
    await waitFor(() => expect(mapHarness.adapter.render).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Next stop' }))
    expect(onSelectItem).toHaveBeenCalledWith('item-b')
    fireEvent.click(screen.getByRole('button', { name: 'Restart walkthrough' }))
    expect(onSelectItem).toHaveBeenCalledWith('item-a')
    fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }))
    expect(screen.getByRole('button', { name: 'Pause walkthrough' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open full-screen map' }))
    expect(screen.getByRole('button', { name: 'Close full-screen map' })).toBeInTheDocument()
  })

  it('reports provider failure without removing the itinerary map region', async () => {
    mapHarness.create.mockRejectedValueOnce(new Error('tile provider unavailable'))
    render(
      <ItineraryMap
        points={points}
        lockedItemIds={new Set()}
        selectedItemId={null}
        onSelectItem={vi.fn()}
      />
    )

    expect(await screen.findByText(/Map tiles are unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Itinerary map' })).toBeInTheDocument()
  })

  it('keeps a single live map adapter through the Strict Mode lifecycle check', async () => {
    render(
      <StrictMode>
        <ItineraryMap
          points={points}
          lockedItemIds={new Set()}
          selectedItemId={null}
          onSelectItem={vi.fn()}
        />
      </StrictMode>
    )

    await waitFor(() => expect(mapHarness.adapter.render).toHaveBeenCalled())
    expect(mapHarness.create).toHaveBeenCalledTimes(1)
    expect(mapHarness.adapter.destroy).not.toHaveBeenCalled()
  })
})
