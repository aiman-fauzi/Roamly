'use client'

import {
  AlertTriangle,
  Check,
  History,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EditableDayCard } from '@/components/features/itinerary/EditableDayCard'
import { ItineraryHeader } from '@/components/features/itinerary/ItineraryHeader'
import { ItineraryHistoryDialog } from '@/components/features/itinerary/ItineraryHistoryDialog'
import { ItineraryMap } from '@/components/features/itinerary/ItineraryMap'
import { ItineraryTimeline } from '@/components/features/itinerary/ItineraryTimeline'
import { TravelContextSummary } from '@/components/features/travel/TravelContextSummary'
import { Button } from '@/components/ui/Button'
import { API } from '@/constants/api'
import type { ItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'
import type { ApiErrorResponse } from '@/types/api'
import type {
  DayPlan,
  ItineraryEditorDocument,
  ItineraryItem,
  ItineraryPeriod,
  ItineraryReplacementOption,
  ItineraryRevisionPreview,
  ItineraryRevisionSummary,
} from '@/types/itinerary'

interface ItineraryEditorProps {
  tripId: string
  destination?: string | null
}

interface ItemPosition {
  itemId: string
  dayNumber: number
  period: ItineraryPeriod
  index: number
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
const PERIODS: ItineraryPeriod[] = ['morning', 'afternoon', 'evening']

class EditorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiErrorResponse
  if (!response.ok) {
    const apiError = body as ApiErrorResponse
    throw new EditorRequestError(apiError.error ?? 'Itinerary update failed.', response.status, apiError.code)
  }
  return body as T
}

function positions(document: ItineraryEditorDocument): ItemPosition[] {
  return document.itinerary.days.flatMap((day) =>
    PERIODS.flatMap((period) =>
      day[period].map((item, index) => ({
        itemId: item.itemId ?? item.candidateId,
        dayNumber: day.dayNumber,
        period,
        index,
      }))
    )
  )
}

function reorderLocal(
  document: ItineraryEditorDocument,
  itemId: string,
  target: Omit<ItemPosition, 'itemId'>
): ItineraryEditorDocument {
  const next = structuredClone(document)
  let moved: ItineraryItem | undefined
  for (const day of next.itinerary.days) {
    for (const period of PERIODS) {
      const index = day[period].findIndex((item) => (item.itemId ?? item.candidateId) === itemId)
      if (index >= 0) moved = day[period].splice(index, 1)[0]
    }
  }
  const day = next.itinerary.days.find((candidate) => candidate.dayNumber === target.dayNumber)
  if (!moved || !day) return document
  day[target.period].splice(Math.min(target.index, day[target.period].length), 0, moved)
  return next
}

function updateItemLocal(
  document: ItineraryEditorDocument,
  itemId: string,
  update: (item: ItineraryItem) => void
) {
  const next = structuredClone(document)
  for (const day of next.itinerary.days) {
    for (const period of PERIODS) {
      const item = day[period].find((candidate) => (candidate.itemId ?? candidate.candidateId) === itemId)
      if (item) update(item)
    }
  }
  return next
}

function StatusBar({
  state,
  message,
  onReload,
  onRetry,
}: {
  state: SaveState
  message: string
  onReload: () => void
  onRetry: (() => void) | null
}) {
  if (state === 'idle') return null
  const icon =
    state === 'saving' ? (
      <LoaderCircle className="h-4 w-4 animate-spin" />
    ) : state === 'saved' ? (
      <Check className="h-4 w-4" />
    ) : (
      <AlertTriangle className="h-4 w-4" />
    )
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-card"
    >
      <span className="inline-flex items-center gap-2">{icon}{message}</span>
      <span className="flex items-center gap-2">
        {state === 'conflict' && (
          <button type="button" className="font-semibold text-primary-700 hover:underline" onClick={onReload}>
            Reload
          </button>
        )}
        {state === 'error' && onRetry && (
          <button type="button" className="font-semibold text-primary-700 hover:underline" onClick={onRetry}>
            Retry
          </button>
        )}
      </span>
    </div>
  )
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 p-4" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-elevated">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100" aria-label="Close dialog" title="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

function ReplacementDialog({
  options,
  loading,
  disabled,
  onSelect,
  onClose,
}: {
  options: ItineraryReplacementOption[]
  loading: boolean
  disabled: boolean
  onSelect: (candidateId: string) => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Choose a replacement" onClose={onClose}>
      <div className="divide-y divide-neutral-200">
        {loading && (
          <div className="flex items-center gap-3 p-6 text-sm text-neutral-700">
            <LoaderCircle className="h-5 w-5 animate-spin text-atlas-600" />
            Loading alternatives...
          </div>
        )}
        {!loading && options.length === 0 && (
          <p className="p-6 text-sm text-neutral-700">No unused alternatives fit this itinerary right now.</p>
        )}
        {options.map((option) => (
          <article key={option.candidateId} className="grid gap-4 p-5 sm:grid-cols-[112px_1fr_auto] sm:items-center">
            <div
              className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-neutral-100 bg-cover bg-center text-neutral-400"
              style={option.image ? { backgroundImage: `url(${JSON.stringify(option.image.url)})` } : undefined}
              role="img"
              aria-label={option.image?.altText ?? option.name}
            >
              {!option.image && <ImageIcon className="h-6 w-6" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-atlas-700">{option.category}</p>
              <h3 className="mt-1 font-semibold text-neutral-900">{option.name}</h3>
              <p className="mt-1 text-sm text-neutral-600">{option.area}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-700">{option.reason}</p>
              {option.image?.licenseName && (
                <p className="mt-2 text-xs text-neutral-500">
                  Image: {option.image.attribution ?? 'source'} / {option.image.licenseName}
                </p>
              )}
            </div>
            <Button type="button" size="sm" disabled={disabled} onClick={() => onSelect(option.candidateId)}>
              Select
            </Button>
          </article>
        ))}
      </div>
    </ModalShell>
  )
}

export function ItineraryEditor({ tripId, destination }: ItineraryEditorProps) {
  const [document, setDocument] = useState<ItineraryEditorDocument | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [lastAction, setLastAction] = useState<(() => void) | null>(null)
  const [replacementItemId, setReplacementItemId] = useState<string | null>(null)
  const [replacementOptions, setReplacementOptions] = useState<ItineraryReplacementOption[]>([])
  const [loadingReplacements, setLoadingReplacements] = useState(false)
  const [confirmDay, setConfirmDay] = useState<number | null>(null)
  const [fallbackDay, setFallbackDay] = useState<DayPlan | null>(null)
  const [revisions, setRevisions] = useState<ItineraryRevisionSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [preview, setPreview] = useState<ItineraryRevisionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const loadRevisions = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch(API.tripItineraryRevisions(tripId), { cache: 'no-store' })
      const body = await readResponse<{ revisions: ItineraryRevisionSummary[] }>(response)
      setRevisions(body.revisions)
      return body.revisions
    } catch (error) {
      setSaveState('error')
      setSaveMessage(error instanceof Error ? error.message : 'Revision history could not be loaded.')
      return []
    } finally {
      setHistoryLoading(false)
    }
  }, [tripId])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const response = await fetch(API.tripItineraryEditor(tripId), { cache: 'no-store' })
      setDocument(await readResponse<ItineraryEditorDocument>(response))
      setSaveState('idle')
      void loadRevisions()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load itinerary editor.')
    }
  }, [loadRevisions, tripId])

  useEffect(() => {
    void load()
  }, [load])

  const itemPositions = useMemo(() => (document ? positions(document) : []), [document])
  const lockedItemIds = useMemo(
    () =>
      new Set(
        document?.itinerary.days.flatMap((day) =>
          PERIODS.flatMap((period) =>
            day[period]
              .filter((item) => item.locked)
              .map((item) => item.itemId ?? item.candidateId)
          )
        ) ?? []
      ),
    [document]
  )

  const mutate = useCallback(async (
    endpoint: string,
    method: 'PUT' | 'POST',
    body: Record<string, unknown>,
    optimistic?: (current: ItineraryEditorDocument) => ItineraryEditorDocument
  ) => {
    if (!document || saveState === 'saving') return
    const previous = document
    const retry = () => void mutate(endpoint, method, body, optimistic)
    setLastAction(() => retry)
    setSaveState('saving')
    setSaveMessage('Saving changes...')
    if (optimistic) setDocument(optimistic(previous))
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, expectedVersion: previous.version }),
      })
      const next = await readResponse<ItineraryEditorDocument>(response)
      setDocument(next)
      void loadRevisions()
      setSaveState('saved')
      setSaveMessage('Changes saved')
      window.setTimeout(() => setSaveState((current) => current === 'saved' ? 'idle' : current), 1800)
    } catch (error) {
      setDocument(previous)
      if (error instanceof EditorRequestError && error.status === 409) {
        setSaveState('conflict')
        setSaveMessage('This itinerary changed in another session.')
      } else {
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Update failed.')
      }
    }
  }, [document, loadRevisions, saveState])

  const reorder = useCallback((itemId: string, target: Omit<ItemPosition, 'itemId'>) => {
    void mutate(
      API.tripItineraryReorder(tripId),
      'PUT',
      { itemId, targetDayNumber: target.dayNumber, targetPeriod: target.period, targetIndex: target.index },
      (current) => reorderLocal(current, itemId, target)
    )
  }, [mutate, tripId])

  const move = useCallback((itemId: string, direction: 'up' | 'down') => {
    const currentIndex = itemPositions.findIndex((position) => position.itemId === itemId)
    const targetPosition = itemPositions[currentIndex + (direction === 'up' ? -1 : 1)]
    if (currentIndex < 0 || !targetPosition) return
    reorder(itemId, {
      dayNumber: targetPosition.dayNumber,
      period: targetPosition.period,
      index: targetPosition.index + (direction === 'down' ? 1 : 0),
    })
  }, [itemPositions, reorder])

  const moveToDay = useCallback((itemId: string, dayNumber: number) => {
    if (!document) return
    const current = itemPositions.find((position) => position.itemId === itemId)
    const day = document.itinerary.days.find((candidate) => candidate.dayNumber === dayNumber)
    if (!current || !day || current.dayNumber === dayNumber) return
    reorder(itemId, { dayNumber, period: current.period, index: day[current.period].length })
  }, [document, itemPositions, reorder])

  const openReplacements = useCallback(async (itemId: string) => {
    setReplacementItemId(itemId)
    setReplacementOptions([])
    setLoadingReplacements(true)
    try {
      const response = await fetch(`${API.tripItineraryReplacements(tripId)}?itemId=${encodeURIComponent(itemId)}`)
      const body = await readResponse<{ options: ItineraryReplacementOption[] }>(response)
      setReplacementOptions(body.options)
    } catch (error) {
      setSaveState('error')
      setSaveMessage(error instanceof Error ? error.message : 'Alternatives could not be loaded.')
      setReplacementItemId(null)
    } finally {
      setLoadingReplacements(false)
    }
  }, [tripId])

  const replace = useCallback((candidateId: string) => {
    if (!replacementItemId) return
    const itemId = replacementItemId
    setReplacementItemId(null)
    void mutate(API.tripItineraryReplacements(tripId), 'PUT', { itemId, candidateId })
  }, [mutate, replacementItemId, tripId])

  const regenerate = useCallback(async (dayNumber: number, acceptFallback: boolean) => {
    if (!document || saveState === 'saving') return
    setConfirmDay(null)
    setSaveState('saving')
    setSaveMessage(acceptFallback ? 'Applying fallback plan...' : 'Regenerating day...')
    const retry = () => void regenerate(dayNumber, acceptFallback)
    setLastAction(() => retry)
    try {
      const response = await fetch(API.tripItineraryRegenerateDay(tripId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayNumber, expectedVersion: document.version, acceptFallback }),
      })
      const result = await readResponse<
        | { state: 'applied'; document: ItineraryEditorDocument }
        | { state: 'fallback_ready'; day: DayPlan; version: number; errorCode: string }
      >(response)
      if (result.state === 'fallback_ready') {
        setFallbackDay(result.day)
        setSaveState('idle')
        setSaveMessage('')
      } else {
        setFallbackDay(null)
        setDocument(result.document)
        void loadRevisions()
        setSaveState('saved')
        setSaveMessage('Day updated')
      }
    } catch (error) {
      if (error instanceof EditorRequestError && error.status === 409) {
        setSaveState('conflict')
        setSaveMessage('This itinerary changed in another session.')
      } else {
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Day regeneration failed.')
      }
    }
  }, [document, loadRevisions, saveState, tripId])

  const openHistory = useCallback(async () => {
    setHistoryOpen(true)
    setPreview(null)
    const nextRevisions = await loadRevisions()
    if (nextRevisions[0]) {
      setPreviewLoading(true)
      try {
        const response = await fetch(
          API.tripItineraryRevision(tripId, nextRevisions[0].id),
          { cache: 'no-store' }
        )
        setPreview(await readResponse<ItineraryRevisionPreview>(response))
      } catch (error) {
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Revision preview could not be loaded.')
      } finally {
        setPreviewLoading(false)
      }
    }
  }, [loadRevisions, tripId])

  const loadPreview = useCallback(async (revisionId: string) => {
    setPreviewLoading(true)
    try {
      const response = await fetch(API.tripItineraryRevision(tripId, revisionId), {
        cache: 'no-store',
      })
      setPreview(await readResponse<ItineraryRevisionPreview>(response))
    } catch (error) {
      setSaveState('error')
      setSaveMessage(error instanceof Error ? error.message : 'Revision preview could not be loaded.')
    } finally {
      setPreviewLoading(false)
    }
  }, [tripId])

  const undo = useCallback(async () => {
    if (!document || saveState === 'saving' || revisions.length === 0) return
    setSaveState('saving')
    setSaveMessage('Undoing last change...')
    try {
      const response = await fetch(API.tripItineraryUndo(tripId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: document.version }),
      })
      const result = await readResponse<{
        state: 'restored' | 'empty'
        document: ItineraryEditorDocument
      }>(response)
      setDocument(result.document)
      await loadRevisions()
      setSaveState('saved')
      setSaveMessage(result.state === 'restored' ? 'Last change undone' : 'No change to undo')
    } catch (error) {
      if (error instanceof EditorRequestError && error.status === 409) {
        setSaveState('conflict')
        setSaveMessage('This itinerary changed in another session.')
      } else {
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Undo failed.')
      }
    }
  }, [document, loadRevisions, revisions.length, saveState, tripId])

  const restoreRevision = useCallback(async (revisionId: string) => {
    if (!document || restoring || saveState === 'saving') return
    setRestoring(true)
    setSaveState('saving')
    setSaveMessage('Restoring revision...')
    try {
      const response = await fetch(API.tripItineraryRevisionRestore(tripId, revisionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: document.version }),
      })
      const next = await readResponse<ItineraryEditorDocument>(response)
      setDocument(next)
      const nextRevisions = await loadRevisions()
      setPreview(null)
      if (nextRevisions[0]) void loadPreview(nextRevisions[0].id)
      setSaveState('saved')
      setSaveMessage('Revision restored')
    } catch (error) {
      if (error instanceof EditorRequestError && error.status === 409) {
        setSaveState('conflict')
        setSaveMessage('This itinerary changed in another session.')
      } else {
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Revision restore failed.')
      }
    } finally {
      setRestoring(false)
    }
  }, [document, loadPreview, loadRevisions, restoring, saveState, tripId])

  useEffect(() => {
    if (!document) return
    if (selectedItemId && document.mapPoints.some((point) => point.itemId === selectedItemId)) return
    setSelectedItemId(document.mapPoints[0]?.itemId ?? null)
  }, [document, selectedItemId])

  const selectFromMap = useCallback((itemId: string) => {
    setSelectedItemId(itemId)
    window.requestAnimationFrame(() => {
      const element = window.document.getElementById(`itinerary-item-${itemId}`)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      element?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
      element?.focus({ preventScroll: true })
    })
  }, [])

  if (loadError) {
    return (
      <div className="rounded-lg border border-error-500 bg-white p-6">
        <h2 className="font-semibold text-neutral-900">Itinerary editor unavailable</h2>
        <p className="mt-2 text-sm text-neutral-700">{loadError}</p>
        <Button type="button" className="mt-4" onClick={() => void load()}>Retry</Button>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-neutral-200 bg-white" aria-live="polite">
        <LoaderCircle className="h-6 w-6 animate-spin text-atlas-600" aria-hidden="true" />
        <span className="ml-3 text-sm font-medium text-neutral-700">Opening itinerary...</span>
      </div>
    )
  }

  const travelContext = (document.itinerary as typeof document.itinerary & {
    itineraryTravelContext?: ItineraryTravelContext
  }).itineraryTravelContext
  const dayNumbers = document.itinerary.days.map((day) => day.dayNumber)
  const regeneratingDay = confirmDay == null
    ? null
    : document.itinerary.days.find((day) => day.dayNumber === confirmDay)
  const lockedCount = regeneratingDay
    ? PERIODS.flatMap((period) => regeneratingDay[period]).filter((item) => item.locked).length
    : 0

  return (
    <div className="space-y-7">
      <StatusBar state={saveState} message={saveMessage} onReload={() => void load()} onRetry={lastAction} />
      <ItineraryHeader itinerary={document.itinerary} destination={destination} />
      {travelContext && <TravelContextSummary context={travelContext} />}
      <ItineraryTimeline roadmap={document.itinerary.roadmap} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-neutral-200 py-3">
        <p className="text-sm text-neutral-600">Version {document.version} / {revisions.length} saved {revisions.length === 1 ? 'change' : 'changes'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revisions.length === 0 || saveState === 'saving' || saveState === 'conflict'}
            onClick={() => void undo()}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Undo last change
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void openHistory()}>
            <History className="h-4 w-4" aria-hidden="true" />
            History
          </Button>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
        <div className="min-w-0 space-y-5">
          {document.itinerary.days.map((day) => (
            <EditableDayCard
              key={day.dayNumber}
              day={day}
              date={document.dayDates[day.dayNumber]}
              notices={document.dayNotices[day.dayNumber] ?? []}
              dayNumbers={dayNumbers}
              disabled={saveState === 'saving' || saveState === 'conflict'}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onMove={move}
              onMoveToDay={moveToDay}
              onDropItem={reorder}
              onLock={(itemId, locked) => void mutate(
                API.tripItineraryLock(tripId),
                'PUT',
                { itemId, locked },
                (current) => updateItemLocal(current, itemId, (item) => { item.locked = locked })
              )}
              onNotes={(itemId, notes) => void mutate(
                API.tripItineraryNotes(tripId),
                'PUT',
                { itemId, notes },
                (current) => updateItemLocal(current, itemId, (item) => { item.editorNotes = notes })
              )}
              onReplace={(itemId) => void openReplacements(itemId)}
              onRegenerate={setConfirmDay}
            />
          ))}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-4">
          <ItineraryMap
            points={document.mapPoints}
            lockedItemIds={lockedItemIds}
            selectedItemId={selectedItemId}
            onSelectItem={selectFromMap}
          />
        </aside>
      </div>

      {replacementItemId && (
        <ReplacementDialog
          options={replacementOptions}
          loading={loadingReplacements}
          disabled={saveState === 'saving'}
          onSelect={replace}
          onClose={() => setReplacementItemId(null)}
        />
      )}

      {regeneratingDay && (
        <ModalShell title={`Regenerate day ${regeneratingDay.dayNumber}`} onClose={() => setConfirmDay(null)}>
          <div className="p-5">
            <p className="text-sm leading-6 text-neutral-700">
              Roamly will rebuild this day from unused destination candidates. {lockedCount > 0 ? `${lockedCount} locked ${lockedCount === 1 ? 'item stays' : 'items stay'} in place.` : 'No items are locked.'}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setConfirmDay(null)}>Cancel</Button>
              <Button type="button" onClick={() => void regenerate(regeneratingDay.dayNumber, false)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Regenerate
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {fallbackDay && (
        <ModalShell title={`Fallback for day ${fallbackDay.dayNumber}`} onClose={() => setFallbackDay(null)}>
          <div className="p-5">
            <p className="text-sm leading-6 text-neutral-700">
              The AI planner was unavailable. This deterministic proposal uses the highest-ranked unused candidates.
            </p>
            <ol className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
              {PERIODS.flatMap((period) => fallbackDay[period]).map((item) => (
                <li key={item.itemId ?? item.candidateId} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold text-neutral-900">{item.title}</p>
                    <p className="mt-1 text-sm text-neutral-600">{item.area ?? item.location}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-atlas-700">{item.time}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setFallbackDay(null)}>Cancel</Button>
              <Button type="button" variant="outline" onClick={() => void regenerate(fallbackDay.dayNumber, false)}>
                Retry AI
              </Button>
              <Button type="button" onClick={() => void regenerate(fallbackDay.dayNumber, true)}>
                Apply fallback
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {historyOpen && (
        <ItineraryHistoryDialog
          current={document}
          revisions={revisions}
          loading={historyLoading}
          preview={preview}
          previewLoading={previewLoading}
          restoring={restoring}
          onPreview={(revisionId) => void loadPreview(revisionId)}
          onRestore={(revisionId) => void restoreRevision(revisionId)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}
