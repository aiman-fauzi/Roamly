'use client'

import 'leaflet/dist/leaflet.css'

import {
  ChevronLeft,
  ChevronRight,
  Expand,
  LocateFixed,
  Map,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ItineraryMapAdapter } from './map/ItineraryMapAdapter'

import { validateItineraryMapPoints } from '@/lib/maps/itineraryMapPoints'
import type { ItineraryMapPoint } from '@/types/itinerary'
import { cn } from '@/utils/cn'

interface ItineraryMapProps {
  points: ItineraryMapPoint[]
  lockedItemIds: ReadonlySet<string>
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}

type DiagnosticStatus = 'success' | 'failure'

function emitMapDiagnostic(input: {
  operation: string
  durationMs?: number
  status?: DiagnosticStatus
  errorCode?: string | null
  validPointCount: number
  skippedPointCount: number
}) {
  // Counts and bounded operational fields only; never log place names, IDs, or coordinates.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: 'roamly_map_diagnostic',
    operation: input.operation,
    durationMs: Number((input.durationMs ?? 0).toFixed(1)),
    status: input.status ?? 'success',
    errorCode: input.errorCode ?? null,
    validPointCount: input.validPointCount,
    skippedPointCount: input.skippedPointCount,
  }))
}

function iconButtonLabel(label: string, children: React.ReactNode, onClick: () => void, disabled = false) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function ItineraryMap({
  points,
  lockedItemIds,
  selectedItemId,
  onSelectItem,
}: ItineraryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const adapterRef = useRef<ItineraryMapAdapter | null>(null)
  const initializationRef = useRef<Promise<ItineraryMapAdapter> | null>(null)
  const [ready, setReady] = useState(false)
  const [providerFailed, setProviderFailed] = useState(false)
  const [offline, setOffline] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const validation = useMemo(() => validateItineraryMapPoints(points), [points])
  const validPoints = validation.validPoints
  const dayNumbers = useMemo(
    () => [...new Set(validPoints.map((point) => point.dayNumber))],
    [validPoints]
  )
  const sequence = useMemo(
    () => validPoints.filter((point) => selectedDay == null || point.dayNumber === selectedDay),
    [selectedDay, validPoints]
  )
  const activeIndex = Math.max(
    0,
    sequence.findIndex((point) => point.itemId === selectedItemId)
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || adapterRef.current) return
    const container = containerRef.current
    const startedAt = performance.now()
    if (!initializationRef.current) {
      initializationRef.current = import('./map/leafletItineraryMapAdapter')
        .then(({ createLeafletItineraryMapAdapter }) =>
          createLeafletItineraryMapAdapter(container, () => {
            setProviderFailed(true)
            emitMapDiagnostic({
              operation: 'map_tile_failure',
              status: 'failure',
              errorCode: 'MAP_TILE_FAILURE',
              validPointCount: validation.validPoints.length,
              skippedPointCount: validation.skippedPointCount,
            })
          })
        )
    }
    void initializationRef.current
      .then((adapter) => {
        if (!container.isConnected) {
          adapter.destroy()
          return
        }
        if (adapterRef.current) return
        adapterRef.current = adapter
        setReady(true)
        emitMapDiagnostic({
          operation: 'map_initialization',
          durationMs: performance.now() - startedAt,
          validPointCount: validation.validPoints.length,
          skippedPointCount: validation.skippedPointCount,
        })
      })
      .catch(() => {
        setProviderFailed(true)
        emitMapDiagnostic({
          operation: 'map_initialization',
          durationMs: performance.now() - startedAt,
          status: 'failure',
          errorCode: 'MAP_INITIALIZATION_FAILED',
          validPointCount: validation.validPoints.length,
          skippedPointCount: validation.skippedPointCount,
        })
      })
    return () => {
      window.setTimeout(() => {
        if (container.isConnected) return
        adapterRef.current?.destroy()
        adapterRef.current = null
        initializationRef.current = null
      }, 0)
    }
  }, []) // Map lifecycle is intentionally independent from changing itinerary points.

  useEffect(() => {
    const adapter = adapterRef.current
    if (!adapter || !ready) return
    const startedAt = performance.now()
    adapter.render(validPoints, {
      lockedItemIds,
      selectedItemId,
      selectedDayNumber: selectedDay,
      onPointSelect: onSelectItem,
    })
    adapter.fitBounds(selectedDay == null ? validPoints : sequence)
    emitMapDiagnostic({
      operation: 'map_marker_render',
      durationMs: performance.now() - startedAt,
      validPointCount: validPoints.length,
      skippedPointCount: validation.skippedPointCount,
    })
  }, [lockedItemIds, onSelectItem, ready, selectedDay, selectedItemId, sequence, validPoints, validation.skippedPointCount])

  useEffect(() => {
    if (!selectedItemId) return
    adapterRef.current?.highlightPoint(selectedItemId, !reducedMotion)
  }, [reducedMotion, selectedItemId])

  useEffect(() => {
    if (!playing || sequence.length === 0) return
    const timer = window.setTimeout(() => {
      const nextIndex = activeIndex + 1
      if (nextIndex >= sequence.length) {
        setPlaying(false)
        emitMapDiagnostic({
          operation: 'map_animation_completion',
          validPointCount: validPoints.length,
          skippedPointCount: validation.skippedPointCount,
        })
        return
      }
      onSelectItem(sequence[nextIndex].itemId)
    }, reducedMotion ? 2200 : 1700)
    return () => window.clearTimeout(timer)
  }, [activeIndex, onSelectItem, playing, reducedMotion, sequence, validPoints.length, validation.skippedPointCount])

  const selectIndex = useCallback((index: number) => {
    const point = sequence[Math.max(0, Math.min(index, sequence.length - 1))]
    if (point) onSelectItem(point.itemId)
  }, [onSelectItem, sequence])

  const startAnimation = useCallback(() => {
    if (sequence.length === 0) return
    if (!selectedItemId || !sequence.some((point) => point.itemId === selectedItemId)) {
      onSelectItem(sequence[0].itemId)
    }
    setPlaying(true)
    emitMapDiagnostic({
      operation: 'map_animation_start',
      validPointCount: validPoints.length,
      skippedPointCount: validation.skippedPointCount,
    })
  }, [onSelectItem, selectedItemId, sequence, validPoints.length, validation.skippedPointCount])

  const activePoint = validPoints.find((point) => point.itemId === selectedItemId) ?? null

  return (
    <section
      aria-label="Itinerary map"
      className={cn(
        'overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-card',
        expanded && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 lg:static lg:block lg:rounded-lg lg:border'
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-atlas-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-neutral-900">Itinerary map</h2>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {validPoints.length} mapped {validPoints.length === 1 ? 'stop' : 'stops'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 lg:hidden"
          aria-label={expanded ? 'Close full-screen map' : 'Open full-screen map'}
          title={expanded ? 'Close full-screen map' : 'Open full-screen map'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </header>

      {dayNumbers.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-3 py-2" aria-label="Map day filter">
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              'h-8 shrink-0 rounded-md px-3 text-xs font-semibold',
              selectedDay == null ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
            )}
          >
            All days
          </button>
          {dayNumbers.map((dayNumber) => (
            <button
              key={dayNumber}
              type="button"
              onClick={() => {
                setPlaying(false)
                setSelectedDay(dayNumber)
                adapterRef.current?.highlightDay(dayNumber)
                const first = validPoints.find((point) => point.dayNumber === dayNumber)
                if (first) onSelectItem(first.itemId)
              }}
              className={cn(
                'h-8 shrink-0 rounded-md px-3 text-xs font-semibold',
                selectedDay === dayNumber ? 'bg-primary-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              )}
            >
              Day {dayNumber}
            </button>
          ))}
        </div>
      )}

      <div className={cn('relative h-[360px] bg-neutral-100 sm:h-[430px] lg:h-[560px]', expanded && 'min-h-0 flex-1 lg:h-[560px]')}>
        <div ref={containerRef} className="h-full w-full" data-testid="itinerary-map-canvas" />
        {!ready && !providerFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
            Preparing map...
          </div>
        )}
        {validPoints.length === 0 && ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 px-6 text-center">
            <LocateFixed className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-neutral-800">No mapped stops yet</p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">Your itinerary remains available in the editor.</p>
          </div>
        )}
        {(providerFailed || offline) && (
          <div className="absolute left-3 right-3 top-3 z-[500] flex items-start gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 shadow-sm">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Map tiles are unavailable. Editing and history still work normally.
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {activePoint && (
          <p className="mb-2 truncate text-xs font-medium text-neutral-700" aria-live="polite">
            Day {activePoint.dayNumber}: {activePoint.title}
          </p>
        )}
        <div className="flex items-center gap-2">
          {iconButtonLabel('Previous stop', <ChevronLeft className="h-4 w-4" />, () => selectIndex(activeIndex - 1), sequence.length < 2 || activeIndex <= 0)}
          {playing
            ? iconButtonLabel('Pause walkthrough', <Pause className="h-4 w-4" />, () => setPlaying(false))
            : iconButtonLabel('Play walkthrough', <Play className="h-4 w-4" />, startAnimation, sequence.length === 0)}
          {iconButtonLabel('Next stop', <ChevronRight className="h-4 w-4" />, () => selectIndex(activeIndex + 1), sequence.length < 2 || activeIndex >= sequence.length - 1)}
          {iconButtonLabel('Restart walkthrough', <RotateCcw className="h-4 w-4" />, () => {
            setPlaying(false)
            selectIndex(0)
          }, sequence.length === 0)}
          <span className="ml-auto text-xs tabular-nums text-neutral-500">
            {sequence.length === 0 ? '0 / 0' : `${activeIndex + 1} / ${sequence.length}`}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          Route lines show itinerary order, not turn-by-turn navigation.
        </p>
        {validation.skippedPointCount > 0 && (
          <p className="mt-1 text-xs text-warning-500">
            {validation.skippedPointCount} invalid map {validation.skippedPointCount === 1 ? 'point was' : 'points were'} skipped.
          </p>
        )}
      </div>
    </section>
  )
}
